'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const registry = require('./modelRegistry');

const AI_DIR = __dirname;
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ARTIFACT_ROOT = registry.ARTIFACT_ROOT;
const DEFAULT_DATASET_PATHS = [
  path.join(REPO_ROOT, 'server', 'ai', 'data', 'features_snapshot.parquet'),
  path.join(REPO_ROOT, 'server', 'ai', 'data', 'features_snapshot.csv'),
  path.join(AI_DIR, 'data', 'features_snapshot.parquet'),
  path.join(AI_DIR, 'data', 'features_snapshot.csv'),
  path.join(REPO_ROOT, 'data', 'features_snapshot.parquet'),
  path.join(REPO_ROOT, 'data', 'features_snapshot.csv'),
  path.join(REPO_ROOT, 'datasets', 'features_snapshot.parquet'),
  path.join(REPO_ROOT, 'datasets', 'features_snapshot.csv'),
];

const VALID_SYMBOLS = /^[A-Z0-9\-._^=]{1,20}$/i;
const VALID_TIMEFRAMES = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d']);

function publicExpectedPaths() {
  return [
    'server/ai/data/features_snapshot.parquet',
    'server/ai/data/features_snapshot.csv',
    'data/features_snapshot.parquet',
    'data/features_snapshot.csv',
    'datasets/features_snapshot.parquet',
    'datasets/features_snapshot.csv',
  ];
}

function resolveDatasetPath(datasetPath) {
  if (datasetPath) {
    const candidate = path.isAbsolute(datasetPath) ? datasetPath : path.resolve(REPO_ROOT, datasetPath);
    return fs.existsSync(candidate) ? candidate : null;
  }
  return DEFAULT_DATASET_PATHS.find((candidate) => fs.existsSync(candidate)) || null;
}

function validateRequest(body = {}) {
  const symbol = String(body.symbol || 'SPY').trim().toUpperCase();
  const timeframe = String(body.timeframe || '1m').trim();
  const horizon = Number.parseInt(body.horizon ?? 20, 10);
  if (!VALID_SYMBOLS.test(symbol)) return { error: 'Invalid symbol' };
  if (!VALID_TIMEFRAMES.has(timeframe)) return { error: `Invalid timeframe: ${timeframe}` };
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 500) return { error: 'horizon must be an integer between 1 and 500' };
  if (body.datasetPath && typeof body.datasetPath !== 'string') return { error: 'datasetPath must be a string when provided' };
  return { symbol, timeframe, horizon, datasetPath: body.datasetPath || '', promote: body.promote === true, costBps: Number(body.costBps ?? body.estimatedRoundtripCostBps ?? 0) || 0 };
}

function parseLastJson(stdout) {
  const lines = String(stdout).trim().split('\n').map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try { return JSON.parse(lines[i]); } catch { /* keep looking */ }
  }
  throw new Error(`Python training script did not emit JSON. stdout=${String(stdout).slice(0, 300)}`);
}

function spawnTraining({ datasetPath, symbol, timeframe, horizon, costBps }) {
  const python = process.env.PYTHON_BIN || 'python3';
  const script = path.join(AI_DIR, 'train_pipeline.py');
  const timeoutMs = Number(process.env.ML_TRAINING_TIMEOUT_MS || 600000);
  const args = [
    script,
    '--dataset', datasetPath,
    '--output-dir', ARTIFACT_ROOT,
    '--symbol', symbol,
    '--timeframe', timeframe,
    '--horizon', String(horizon),
    '--cost-bps', String(costBps),
  ];
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(python, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve({ ok: false, status: 'training_failed', message: `Training timeout after ${timeoutMs}ms`, details: { stdout: stdout.slice(-1000), stderr: stderr.slice(-2000) } });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, status: 'training_failed', message: error.message, details: { stderr } });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        const parsed = parseLastJson(stdout);
        if (code !== 0 && parsed.ok !== false) {
          return resolve({ ok: false, status: 'training_failed', message: `Python exited with code ${code}`, details: { stdout: stdout.slice(-1000), stderr: stderr.slice(-2000) } });
        }
        return resolve(parsed);
      } catch (error) {
        return resolve({ ok: false, status: 'training_failed', message: error.message, details: { code, stdout: stdout.slice(-1000), stderr: stderr.slice(-2000) } });
      }
    });
  });
}

async function trainModel(body = {}) {
  const request = validateRequest(body);
  if (request.error) return { ok: false, status: 'invalid_request', message: request.error };
  const datasetPath = resolveDatasetPath(request.datasetPath);
  if (!datasetPath) {
    return {
      ok: false,
      status: 'dataset_missing',
      message: 'No dataset snapshot found. Generate or upload a dataset before training.',
      expectedPaths: publicExpectedPaths(),
    };
  }
  const result = await spawnTraining({ ...request, datasetPath });
  if (!result.ok) {
    return {
      ok: false,
      status: result.status || 'training_failed',
      message: result.message || 'Training failed',
      details: result.details || {},
    };
  }
  const manifest = result.manifest || {};
  let registered = registry.registerModel({
    modelId: result.modelId,
    createdAt: manifest.createdAt,
    symbol: request.symbol,
    timeframe: request.timeframe,
    horizon: request.horizon,
    datasetHash: manifest.datasetHash,
    featureSchemaHash: manifest.featureSchemaHash,
    metrics: result.metrics,
    artifactPath: result.artifactPath,
    manifestPath: result.manifestPath,
    status: 'candidate',
  });
  let promoted = false;
  if (request.promote) {
    registered = registry.promoteModel(registered.modelId);
    promoted = true;
  }
  return {
    ok: true,
    status: 'trained',
    modelId: registered.modelId,
    artifactPath: registered.artifactPath,
    metrics: result.metrics,
    promoted,
  };
}

module.exports = { trainModel, validateRequest, resolveDatasetPath, publicExpectedPaths, DEFAULT_DATASET_PATHS };
