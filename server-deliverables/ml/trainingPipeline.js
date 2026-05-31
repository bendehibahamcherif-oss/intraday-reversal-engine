'use strict';

/**
 * Training pipeline — orchestrates Python XGBoost subprocess.
 *
 * Flow:
 *   1. Build dataset from feature snapshots + candle history
 *   2. Serialize to temp JSON file
 *   3. Spawn train_xgboost.py as subprocess
 *   4. Read stdout manifest
 *   5. Register model in registry
 *   6. Auto-promote if no champion exists
 */

const { spawn }  = require('child_process');
const fs         = require('fs');
const path       = require('path');
const os         = require('os');
const crypto     = require('crypto');

const featureStore   = require('./featureStore');
const { buildDataset } = require('./datasetBuilder');
const registry       = require('./modelRegistry');

const PYTHON_SCRIPT = path.join(__dirname, 'python', 'train_xgboost.py');
const MODELS_DIR    = path.join(__dirname, 'models');
const TIMEOUT_MS    = 5 * 60 * 1000; // 5 minutes

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Run the full training pipeline for a symbol.
 *
 * @param {object} opts
 * @param {string}  opts.symbol
 * @param {string}  opts.timeframe
 * @param {Array}   opts.candles         full candle history (for labeling)
 * @param {number}  [opts.estimatedRoundtripCostBps]
 * @param {object}  [opts.xgbConfig]     XGBoost hyperparameter overrides
 * @returns {Promise<{ok, modelVersion, manifest, error}>}
 */
async function runTraining(opts) {
  const {
    symbol, timeframe = '1m', candles = [],
    estimatedRoundtripCostBps = null,
    xgbConfig = {},
  } = opts;

  // 1. Fetch canonical snapshots
  const snapshots = featureStore.getCanonicalHistory(symbol, timeframe, 'p1_v1', 500);
  if (snapshots.length < 30) {
    return { ok: false, error: `Insufficient snapshots: ${snapshots.length} (need >= 30)` };
  }

  // 2. Build dataset
  const dataset = buildDataset(snapshots, candles, { estimatedRoundtripCostBps, symbol, timeframe });
  if (!dataset.ok) return { ok: false, error: dataset.reason };
  if (dataset.nSamples < 30) return { ok: false, error: `Too few labeled samples: ${dataset.nSamples}` };

  // 3. Write dataset to temp file
  ensureDir(MODELS_DIR);
  const runId      = crypto.randomBytes(4).toString('hex');
  const datasetPath = path.join(os.tmpdir(), `dataset_${symbol}_${runId}.json`);
  const outputDir   = path.join(MODELS_DIR, `${symbol}_${runId}`);
  ensureDir(outputDir);

  fs.writeFileSync(datasetPath, JSON.stringify(dataset));

  try {
    // 4. Spawn Python training
    const result = await _spawnPython(datasetPath, outputDir, xgbConfig);
    if (!result.ok) return result;

    const manifest = result.manifest;

    // 5. Register model
    const enrichedManifest = {
      ...manifest,
      symbol,
      timeframe,
      artifactPath:  result.modelPath,
      manifestPath:  result.manifestPath,
    };
    registry.register(enrichedManifest);

    // 6. Auto-promote if no champion
    const champion = registry.getChampion(symbol);
    if (!champion) {
      registry.promoteChampion(manifest.modelVersion);
    }

    return { ok: true, modelVersion: manifest.modelVersion, manifest: enrichedManifest };
  } finally {
    // Cleanup temp dataset file
    try { fs.unlinkSync(datasetPath); } catch {}
  }
}

function _spawnPython(datasetPath, outputDir, xgbConfig) {
  return new Promise((resolve) => {
    const python = process.env.PYTHON_BIN || 'python3';
    const configStr = JSON.stringify(xgbConfig || {});

    const child = spawn(python, [
      PYTHON_SCRIPT,
      '--dataset', datasetPath,
      '--output-dir', outputDir,
      '--config', configStr,
    ], { timeout: TIMEOUT_MS });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => resolve({ ok: false, error: err.message }));

    child.on('close', (code) => {
      if (code !== 0) {
        return resolve({ ok: false, error: `Python exited ${code}: ${stderr.slice(0, 500)}` });
      }
      try {
        // Last JSON line is the result
        const lines = stdout.trim().split('\n').filter(Boolean);
        const last  = JSON.parse(lines[lines.length - 1]);
        if (last.status === 'error') return resolve({ ok: false, error: last.message });

        const manifestRaw = fs.readFileSync(last.manifestPath, 'utf8');
        const manifest    = JSON.parse(manifestRaw);
        resolve({ ok: true, manifest, modelPath: last.modelPath, manifestPath: last.manifestPath });
      } catch (err) {
        resolve({ ok: false, error: `Failed to parse training output: ${err.message}`, stdout });
      }
    });
  });
}

module.exports = { runTraining };
