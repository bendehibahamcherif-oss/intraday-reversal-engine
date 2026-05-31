'use strict';

/**
 * pythonInference.js — Persistent Python worker pool for ML inference.
 *
 * Architecture:
 *   - Pool of POOL_SIZE workers (default 2), each a persistent Python process
 *   - Round-robin request routing across ready workers
 *   - Per-request timeout (INFER_TIMEOUT_MS, default 400ms)
 *   - Automatic worker restart on crash with exponential backoff
 *   - newline-delimited JSON over stdin/stdout
 *
 * Protocol:
 *   startup:  → {"action":"load","modelPath":"...","modelVersion":"..."}
 *             ← {"status":"ready","modelPath":"...","loadTimeMs":123}
 *   predict:  → {"action":"predict","features":[...],"featureNames":[...],"requestId":"uuid"}
 *             ← {"status":"ok","requestId":"...","signal":"LONG","probability":0.8,...}
 *   health:   → {"action":"health","requestId":"uuid"}
 *             ← {"status":"ok","modelLoaded":true,"requestId":"uuid"}
 *   shutdown: → {"action":"shutdown"}
 */

const { spawn }  = require('child_process');
const path       = require('path');
const crypto     = require('crypto');
const fs         = require('fs');

const POOL_SIZE        = Number(process.env.ML_WORKER_POOL_SIZE) || 2;
const INFER_TIMEOUT_MS = Number(process.env.ML_INFER_TIMEOUT_MS) || 400;
const RESTART_DELAY_MS = 2000;
const MAX_RESTARTS     = 5;

const INFER_SCRIPT = process.env.ML_WORKER_SCRIPT
  || path.join(__dirname, 'inference', 'infer_worker.py');

const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';

// ── Worker state ──────────────────────────────────────────────────────────────

/** @type {WorkerState[]} */
let _pool = [];
let _modelPath    = null;
let _modelVersion = null;
let _initialized  = false;
let _roundRobinIdx = 0;

/**
 * @typedef {Object} WorkerState
 * @property {import('child_process').ChildProcess|null} proc
 * @property {boolean} ready
 * @property {string}  lineBuffer
 * @property {Map<string, PendingRequest>} pending
 * @property {number}  restartCount
 * @property {number}  workerId
 */

/**
 * @typedef {Object} PendingRequest
 * @property {Function} resolve
 * @property {Function} reject
 * @property {NodeJS.Timeout} timer
 */

// ── Worker lifecycle ──────────────────────────────────────────────────────────

function _makeWorkerState(id) {
  return {
    proc: null,
    ready: false,
    lineBuffer: '',
    pending: new Map(),
    restartCount: 0,
    workerId: id,
  };
}

/**
 * Start (or restart) a single worker process.
 * @param {WorkerState} w
 * @returns {Promise<void>}
 */
function _startWorker(w) {
  return new Promise((resolve, reject) => {
    if (!_modelPath) {
      return reject(new Error('No model path configured — call init() first'));
    }

    if (!fs.existsSync(INFER_SCRIPT)) {
      return reject(new Error(`Worker script not found: ${INFER_SCRIPT}`));
    }

    w.ready = false;
    w.lineBuffer = '';

    const proc = spawn(PYTHON_BIN, [INFER_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    w.proc = proc;

    // ── Startup handshake ─────────────────────────────────────────────────────
    let startupDone = false;
    const startupBuffer = { text: '' };
    const startupTimer  = setTimeout(() => {
      if (!startupDone) reject(new Error(`Worker ${w.workerId} startup timeout`));
    }, 10_000);

    const onStartupData = (chunk) => {
      startupBuffer.text += chunk.toString();
      const lines = startupBuffer.text.split('\n');
      startupBuffer.text = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.status === 'ready') {
            clearTimeout(startupTimer);
            startupDone = true;
            w.ready = true;

            // Switch to normal data handler
            proc.stdout.removeListener('data', onStartupData);
            proc.stdout.on('data', (d) => _onData(w, d));
            resolve();
            return;
          }
          if (msg.status === 'error') {
            clearTimeout(startupTimer);
            reject(new Error(`Worker load error: ${msg.message}`));
            return;
          }
        } catch { /* ignore parse errors during startup */ }
      }
    };

    proc.stdout.on('data', onStartupData);
    proc.stderr.on('data', () => { /* suppress unless debug */ });

    proc.on('error', (err) => {
      if (!startupDone) { clearTimeout(startupTimer); reject(err); }
      _onWorkerExit(w, 1);
    });

    proc.on('exit', (code) => {
      if (!startupDone) { clearTimeout(startupTimer); reject(new Error(`Worker exited (${code}) before ready`)); }
      _onWorkerExit(w, code);
    });

    // Send load command
    _writeTo(proc, { action: 'load', modelPath: _modelPath, modelVersion: _modelVersion || 'unknown' });
  });
}

/**
 * Handle incoming data for a running worker (post-startup).
 */
function _onData(w, chunk) {
  w.lineBuffer += chunk.toString();
  const lines = w.lineBuffer.split('\n');
  w.lineBuffer  = lines.pop();

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      const pending = w.pending.get(msg.requestId);
      if (!pending) continue;
      clearTimeout(pending.timer);
      w.pending.delete(msg.requestId);
      if (msg.status === 'error') pending.reject(new Error(msg.message || 'Inference error'));
      else pending.resolve(msg);
    } catch { /* ignore malformed JSON */ }
  }
}

/**
 * Handle worker exit — reject all pending requests, schedule restart.
 */
function _onWorkerExit(w, code) {
  w.ready = false;
  w.proc  = null;

  // Reject all in-flight requests
  for (const [, pending] of w.pending) {
    clearTimeout(pending.timer);
    pending.reject(new Error(`Worker ${w.workerId} exited unexpectedly (code ${code})`));
  }
  w.pending.clear();

  if (!_modelPath || w.restartCount >= MAX_RESTARTS) return;

  w.restartCount++;
  const delay = RESTART_DELAY_MS * Math.pow(2, w.restartCount - 1);

  setTimeout(() => {
    _startWorker(w).catch((err) => {
      console.error(`[pythonInference] Worker ${w.workerId} restart failed:`, err.message);
    });
  }, delay);
}

function _writeTo(proc, obj) {
  if (proc?.stdin?.writable) {
    proc.stdin.write(JSON.stringify(obj) + '\n');
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Initialize the worker pool with a model.
 * Idempotent — re-calling with the same modelPath is a no-op.
 * Re-calling with a different modelPath restarts all workers.
 *
 * @param {object} opts
 * @param {string} opts.modelPath     Absolute path to model.ubj
 * @param {string} [opts.modelVersion]
 * @returns {Promise<void>}
 */
async function init({ modelPath, modelVersion = 'unknown' } = {}) {
  if (!modelPath) throw new Error('modelPath is required');

  if (_initialized && _modelPath === modelPath) return; // already up

  // Shutdown existing pool if any
  if (_initialized) await shutdown();

  _modelPath    = modelPath;
  _modelVersion = modelVersion;
  _initialized  = false;
  _pool         = Array.from({ length: POOL_SIZE }, (_, i) => _makeWorkerState(i));

  await Promise.all(_pool.map((w) => _startWorker(w)));
  _initialized = true;
}

/**
 * Run inference on a feature vector.
 *
 * @param {object} payload
 * @param {number[]} payload.features      ordered feature values
 * @param {string[]} payload.featureNames  ordered feature names
 * @param {object}  [opts]
 * @param {number}  [opts.timeoutMs]
 * @returns {Promise<{signal, probability, confidence, probabilities, classIndex, modelVersion, inferenceMs}>}
 */
function inferWithPython(payload, { timeoutMs = INFER_TIMEOUT_MS } = {}) {
  if (!_initialized) return Promise.reject(new Error('Worker pool not initialized — call init() first'));
  if (!payload?.features || !payload?.featureNames) {
    return Promise.reject(new Error('payload.features and payload.featureNames are required'));
  }

  // Pick a ready worker (round-robin, skip non-ready)
  let worker = null;
  for (let attempt = 0; attempt < _pool.length; attempt++) {
    const candidate = _pool[(_roundRobinIdx + attempt) % _pool.length];
    if (candidate.ready) { worker = candidate; break; }
  }
  _roundRobinIdx = (_roundRobinIdx + 1) % _pool.length;

  if (!worker) {
    return Promise.reject(new Error('No ready workers in pool — all workers busy or crashed'));
  }

  const requestId = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.pending.delete(requestId);
      reject(new Error(`Inference timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    worker.pending.set(requestId, { resolve, reject, timer });

    _writeTo(worker.proc, {
      action:       'predict',
      features:     payload.features,
      featureNames: payload.featureNames,
      requestId,
    });
  });
}

/**
 * Send health check to all workers.
 * @returns {Promise<object[]>}
 */
async function healthCheck() {
  const results = await Promise.allSettled(_pool.map((w) => {
    if (!w.ready || !w.proc) {
      return Promise.resolve({ workerId: w.workerId, ready: false, modelLoaded: false });
    }
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        w.pending.delete(requestId);
        reject(new Error('Health check timeout'));
      }, 2000);
      w.pending.set(requestId, { resolve, reject, timer });
      _writeTo(w.proc, { action: 'health', requestId });
    });
  }));

  return results.map((r, i) => ({
    workerId: i,
    ...(r.status === 'fulfilled' ? r.value : { error: r.reason?.message }),
  }));
}

/**
 * Get pool status (non-async).
 */
function getPoolStatus() {
  return {
    initialized:  _initialized,
    poolSize:     _pool.length,
    readyWorkers: _pool.filter((w) => w.ready).length,
    modelPath:    _modelPath,
    modelVersion: _modelVersion,
    workers: _pool.map((w) => ({
      workerId:      w.workerId,
      ready:         w.ready,
      pendingCount:  w.pending.size,
      restartCount:  w.restartCount,
    })),
  };
}

/**
 * Graceful shutdown — send shutdown to all workers and wait for exit.
 */
async function shutdown() {
  _initialized = false;
  const exits = _pool.map((w) => new Promise((resolve) => {
    if (!w.proc) { resolve(); return; }
    w.proc.once('exit', resolve);
    setTimeout(resolve, 2000); // fallback
    try { _writeTo(w.proc, { action: 'shutdown' }); } catch {}
  }));
  await Promise.all(exits);
  _pool = [];
  _modelPath = null;
}

module.exports = { init, inferWithPython, healthCheck, getPoolStatus, shutdown };
