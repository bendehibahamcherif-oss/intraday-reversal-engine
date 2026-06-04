'use strict';

/**
 * Inference service — manages a persistent Python worker process (infer_worker.py).
 *
 * The worker is started once and reused for all predictions.
 * Communication: newline-delimited JSON over stdin/stdout.
 * Latency target: < 100 ms per prediction in warm state.
 */

const { spawn }  = require('child_process');
const path       = require('path');
const crypto     = require('crypto');

const registry = require('./modelRegistry');
const { computeFeatures, toFeatureVector } = require('./featureService');
const featureStore = require('./featureStore');

const INFER_SCRIPT  = path.join(__dirname, 'python', 'infer_worker.py');
const PREDICT_TIMEOUT_MS = 2000;

let _worker      = null;
let _workerReady = false;
let _loadedModel = null;
let _pendingRequests = new Map(); // requestId → { resolve, reject, timer }
let _lineBuffer  = '';

// ── Worker lifecycle ──────────────────────────────────────────────────────────

function _startWorker(modelPath) {
  return new Promise((resolve, reject) => {
    const python = process.env.PYTHON_BIN || 'python3';
    _worker      = spawn(python, [INFER_SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] });
    _workerReady = false;
    _loadedModel = null;

    _worker.stdout.on('data', _onData);
    _worker.stderr.on('data', (d) => { /* log only in debug */ });
    _worker.on('exit', (code) => {
      _worker = null; _workerReady = false; _loadedModel = null;
      // Reject any requests still waiting — prevents indefinite hangs.
      for (const [id, pending] of _pendingRequests) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`Inference worker exited unexpectedly (code ${code})`));
      }
      _pendingRequests.clear();
    });
    _worker.on('error', (err) => { reject(err); });

    // Send load command
    _writeLine({ action: 'load', modelPath });

    // Wait for ready
    const timer = setTimeout(() => reject(new Error('Worker startup timeout')), 10_000);

    const origOnData = _worker.stdout.listeners('data')[0];
    const waitForReady = (data) => {
      _lineBuffer += data.toString();
      const lines = _lineBuffer.split('\n');
      _lineBuffer  = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.status === 'ready') {
            clearTimeout(timer);
            _workerReady = true;
            _loadedModel = modelPath;
            // Switch to normal data handler
            _worker.stdout.removeListener('data', waitForReady);
            _worker.stdout.on('data', _onData);
            resolve(true);
            return;
          }
        } catch {}
      }
    };

    _worker.stdout.removeListener('data', _onData);
    _worker.stdout.on('data', waitForReady);
  });
}

function _onData(data) {
  _lineBuffer += data.toString();
  const lines = _lineBuffer.split('\n');
  _lineBuffer  = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      const pending = _pendingRequests.get(msg.requestId);
      if (!pending) continue;
      clearTimeout(pending.timer);
      _pendingRequests.delete(msg.requestId);
      if (msg.status === 'error') pending.reject(new Error(msg.message));
      else pending.resolve(msg);
    } catch {}
  }
}

function _writeLine(obj) {
  _worker.stdin.write(JSON.stringify(obj) + '\n');
}

/**
 * Ensure worker is running with the champion model.
 * Reloads if champion has changed.
 */
async function ensureWorker(symbol) {
  const champion = registry.getChampion(symbol);
  if (!champion) throw new Error(`No champion model for symbol ${symbol}`);

  const modelPath = champion.artifactPath;
  if (!modelPath) throw new Error('Champion model has no artifactPath');

  if (_worker && _workerReady && _loadedModel === modelPath) return; // already loaded

  // Stop existing worker if any
  if (_worker) {
    try { _writeLine({ action: 'shutdown' }); } catch {}
    _worker = null; _workerReady = false;
  }

  await _startWorker(modelPath);
}

/**
 * Run inference for a symbol using current market data.
 *
 * @param {string} symbol
 * @param {object} marketData  same shape as computeFeatures opts
 * @param {boolean} [provisional]
 * @returns {Promise<object>}  signal response
 */
async function infer(symbol, marketData, provisional = false) {
  const featureStart = Date.now();

  // Compute features
  const snapshot = computeFeatures({
    symbol,
    timeframe:  marketData.timeframe || '1m',
    asOf:       marketData.asOf,
    provisional,
    candles:    marketData.candles || [],
    vwap:       marketData.vwap,
    vwapTimestamp: marketData.vwapTimestamp,
    poc:        marketData.poc,
    volumeProfileTimestamp: marketData.volumeProfileTimestamp,
    cvdHistory: marketData.cvdHistory || [],
    footprintBars: marketData.footprintBars || [],
  });

  const featureMs = Date.now() - featureStart;

  // Persist canonical snapshots only
  if (!provisional) featureStore.save(snapshot);

  // Ensure champion worker running
  await ensureWorker(symbol);

  const champion = registry.getChampion(symbol);
  const vector   = toFeatureVector(snapshot);
  const requestId = crypto.randomUUID();

  const inferStart = Date.now();

  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pendingRequests.delete(requestId);
      reject(new Error('Inference timeout'));
    }, PREDICT_TIMEOUT_MS);

    _pendingRequests.set(requestId, { resolve, reject, timer });
    _writeLine({
      action:       'predict',
      features:     vector,
      featureNames: snapshot.features ? Object.keys(snapshot.features) : [],
      requestId,
    });
  });

  const inferMs = Date.now() - inferStart;

  return {
    symbol,
    timeframe:     marketData.timeframe || '1m',
    asOf:          snapshot.asOf,
    modelVersion:  champion.modelVersion,
    featureVersion: snapshot.featureVersion,
    provisional,
    class:         result.class,
    classIndex:    result.classIndex,
    probabilities: result.probabilities,
    confidence:    result.confidence,
    champion:      true,
    diagnostics: {
      inferenceLatencyMs:  inferMs,
      featureComputeMs:    featureMs,
      driftStatus:         'ok',
      missingFeatureCount: snapshot.missingFeatureCount || 0,
    },
  };
}

/**
 * Run inference from an already-computed feature snapshot (for scheduled canonical signals).
 */
async function inferFromSnapshot(symbol, snapshot) {
  await ensureWorker(symbol);
  const champion = registry.getChampion(symbol);
  const vector   = toFeatureVector(snapshot);
  const requestId = crypto.randomUUID();

  const start = Date.now();
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pendingRequests.delete(requestId);
      reject(new Error('Inference timeout'));
    }, PREDICT_TIMEOUT_MS);
    _pendingRequests.set(requestId, { resolve, reject, timer });
    _writeLine({ action: 'predict', features: vector, featureNames: Object.keys(snapshot.features), requestId });
  });

  return {
    symbol,
    timeframe:     snapshot.timeframe,
    asOf:          snapshot.asOf,
    modelVersion:  champion.modelVersion,
    featureVersion: snapshot.featureVersion,
    provisional:   snapshot.provisional,
    class:         result.class,
    classIndex:    result.classIndex,
    probabilities: result.probabilities,
    confidence:    result.confidence,
    champion:      true,
    diagnostics:   { inferenceLatencyMs: Date.now() - start, missingFeatureCount: snapshot.missingFeatureCount || 0 },
  };
}

function getWorkerStatus() {
  return {
    running:     !!_worker,
    ready:       _workerReady,
    loadedModel: _loadedModel,
    pendingRequests: _pendingRequests.size,
  };
}

function shutdown() {
  if (_worker) {
    try { _writeLine({ action: 'shutdown' }); } catch {}
    _worker = null; _workerReady = false;
  }
}

module.exports = { infer, inferFromSnapshot, ensureWorker, getWorkerStatus, shutdown };
