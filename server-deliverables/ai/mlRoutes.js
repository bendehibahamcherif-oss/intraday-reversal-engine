'use strict';

/**
 * ML Engine REST routes — Phase 9B.
 *
 * Mount at: app.use('/api/ml', require('./ai/mlRoutes'))
 *
 * GET  /api/ml/health                — worker pool + model health
 * GET  /api/ml/model                 — champion model info
 * POST /api/ml/infer/:symbol         — real-time inference
 * POST /api/ml/train                 — trigger Python training pipeline
 * GET  /api/ml/model-runs            — training run history
 * GET  /api/ml/predictions           — prediction history
 * GET  /api/ml/feature-importance    — feature importance from champion
 * GET  /api/ml/drift                 — PSI drift report
 * GET  /api/ml/model-card            — model card metadata
 * POST /api/ml/models/:version/promote — promote model to champion
 *
 * Also re-exports Phase 9A routes for backward compat:
 * GET  /api/ml/features/:symbol
 * GET  /api/ml/signal/:symbol
 * GET  /api/ml/models
 * GET  /api/ml/metrics
 * GET  /api/ml/worker/status
 */

const { Router } = require('express');
const path        = require('path');
const fs          = require('fs');

const workerPool  = require('./pythonInference');

// Phase 9A modules (backward compat)
let featureStore, registry, runTraining, inferenceService, evaluation, scheduler;
try {
  featureStore     = require('../ml/featureStore');
  registry         = require('../ml/modelRegistry');
  const pipeline   = require('../ml/trainingPipeline');
  runTraining      = pipeline.runTraining;
  inferenceService = require('../ml/inferenceService');
  evaluation       = require('../ml/evaluationService');
  scheduler        = require('../ml/liveSignalScheduler');
} catch {
  // Phase 9A modules may not be present in all deployments
}

// Phase 9B registry (SQLite) — optional
let sqlRegistry;
try {
  const { ModelRegistry } = require('./registry/model_registry');
  sqlRegistry = new ModelRegistry();
} catch { /* SQLite registry not available */ }

const MODEL_DIR  = path.join(__dirname, 'models');
const VALID_SYMBOLS = /^[A-Z0-9\-._^=]{1,20}$/i;
const VALID_TIMEFRAMES = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d']);

const router = Router();

// ── Validation helpers ────────────────────────────────────────────────────────

function validateSymbol(s) {
  return typeof s === 'string' && VALID_SYMBOLS.test(s);
}

function validateTimeframe(tf) {
  return !tf || VALID_TIMEFRAMES.has(tf);
}

function getRegistryChampion() {
  if (sqlRegistry?.getChampion) return sqlRegistry.getChampion();
  if (sqlRegistry?.get_champion) return sqlRegistry.get_champion();
  if (registry?.getChampion) return registry.getChampion();
  return null;
}

function getRegistryChallengers() {
  if (sqlRegistry?.list_models) {
    return sqlRegistry.list_models(undefined, 50).filter((model) => model?.status === 'challenger' || model?.challenger === true);
  }
  if (registry?.getChallenger) {
    const challenger = registry.getChallenger();
    return challenger ? [challenger] : [];
  }
  return [];
}

function normalizeRuns(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.runs)) return value.runs;
  if (Array.isArray(value?.models)) return value.models;
  if (Array.isArray(value?.activeJobs)) return value.activeJobs;
  return [];
}

function emptyModelResponse() {
  return { ok: true, champion: null, challengers: [], status: 'no_model' };
}

function emptyDriftResponse() {
  return { ok: true, drift: { status: 'not_enough_data', psi: {}, features: [], lastComputedAt: null } };
}

function optionalSymbol(raw, fallback = 'SPY') {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const symbol = String(raw).trim().toUpperCase();
  return validateSymbol(symbol) ? symbol : fallback;
}

function jsonError(res, status, message, extra = {}) {
  return res.status(status).type('application/json').json({ ok: false, status: extra.status || 'error', message, error: message, ...extra });
}

// ── GET /api/ml/health ────────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  try {
    const pool  = workerPool.getPoolStatus();
    const phase9 = inferenceService ? inferenceService.getWorkerStatus() : null;
    const champ  = getRegistryChampion();

    res.json({
      ok: true,
      status: 'available',
      worker: {
        available: pool.readyWorkers > 0 || (phase9?.ready ?? false),
        mode: pool.readyWorkers > 0 ? 'worker_pool' : ((phase9?.ready ?? false) ? 'phase9_worker' : 'not_configured'),
      },
      workerPool:  pool,
      phase9Worker: phase9,
      champion:    champ,
      timestamp:   new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/ml/model ─────────────────────────────────────────────────────────
router.get('/model', (req, res) => {
  try {
    const champ = getRegistryChampion();

    if (!champ) return res.json(emptyModelResponse());

    const metricsPath = path.join(MODEL_DIR, 'metrics.json');
    const schemaPath  = path.join(MODEL_DIR, 'feature_schema.json');
    const metaPath    = path.join(MODEL_DIR, 'metadata.json');

    const metrics = fs.existsSync(metricsPath) ? JSON.parse(fs.readFileSync(metricsPath, 'utf8')) : null;
    const schema  = fs.existsSync(schemaPath)  ? JSON.parse(fs.readFileSync(schemaPath,  'utf8')) : null;
    const meta    = fs.existsSync(metaPath)    ? JSON.parse(fs.readFileSync(metaPath,    'utf8')) : null;

    const champion = {
      ...champ,
      version:          champ.version || champ.modelVersion || champ.champion,
      datasetHash:      champ.dataset_hash  || champ.datasetHash || meta?.datasetHash  || '',
      featureHash:      champ.feature_schema_hash || champ.featureHash || meta?.featureSchemaHash || '',
      symbol:           champ.symbol   || '',
      timeframe:        champ.timeframe || '',
      horizon:          champ.horizon   || 5,
      trainingWindow:   { start: champ.training_window_start || champ.trainingWindowStart || null, end: champ.training_window_end || champ.trainingWindowEnd || null },
      metrics,
      schema,
      promotedAt:       champ.promoted_at || champ.promotedAt || null,
      artifactUri:      champ.artifact_uri || champ.artifactUri || null,
    };

    res.json({
      ok: true,
      champion,
      challengers: getRegistryChallengers(),
      status: 'champion_available',
      ...champion,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/ml/infer/:symbol ────────────────────────────────────────────────
router.post('/infer/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    if (!validateSymbol(symbol)) return jsonError(res, 400, 'Invalid symbol', { status: 'invalid_symbol' });

    const { timeframe = '1m', featureVector, modelVersion = 'champion' } = req.body || {};

    if (!validateTimeframe(timeframe)) {
      return jsonError(res, 400, `Invalid timeframe: ${timeframe}`, { status: 'invalid_timeframe' });
    }

    if (!getRegistryChampion()) {
      return res.json({
        ok: false,
        status: 'no_champion_model',
        message: 'No champion model available. Train and promote a model first.',
      });
    }

    if (!Array.isArray(featureVector) || featureVector.length === 0) {
      return jsonError(res, 400, 'featureVector must be a non-empty array', { status: 'invalid_feature_vector' });
    }
    if (!featureVector.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      return jsonError(res, 400, 'featureVector must contain only finite numbers', { status: 'invalid_feature_vector' });
    }

    const pool = workerPool.getPoolStatus();
    if (!pool.initialized || pool.readyWorkers === 0) {
      // Fall back to Phase 9A inference if available
      if (inferenceService && featureStore) {
        const snap = featureStore.getLatestCanonical(symbol.toUpperCase(), timeframe);
        if (snap) {
          const signal = await inferenceService.inferFromSnapshot(symbol.toUpperCase(), snap);
          return res.json({ ok: true, ...signal, _source: 'phase9a_fallback' });
        }
      }
      return jsonError(res, 503, 'Python inference worker stopped', { status: 'worker_stopped' });
    }

    // Get feature names from model schema
    const schemaPath = path.join(MODEL_DIR, 'feature_schema.json');
    let featureNames = [];
    if (fs.existsSync(schemaPath)) {
      try {
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
        featureNames = Array.isArray(schema) ? schema.map((f) => f.name || f) : Object.keys(schema);
      } catch { /* use empty */ }
    }
    if (featureNames.length === 0) {
      // Default P1 feature names
      featureNames = [
        'ret_1m','ret_5m','ret_15m','vwap_gap','rsi14',
        'ema_spread_9_20','ema_cross_event','vol_spike_20',
        'poc_distance','cvd_delta_5','footprint_imbalance_recent',
      ];
    }

    const result = await workerPool.inferWithPython({ features: featureVector, featureNames });

    res.json({
      ok:         true,
      symbol:     symbol.toUpperCase(),
      timeframe,
      signal:     result.signal,
      probability: result.probability,
      confidence: result.confidence,
      probabilities: result.probabilities,
      classIndex: result.classIndex,
      modelVersion: result.modelVersion || modelVersion,
      inferenceMs: result.inferenceMs,
      timestamp:  new Date().toISOString(),
    });
  } catch (err) {
    const status = err.message?.includes('timeout') ? 504 : 500;
    jsonError(res, status, err.message, { status: status === 504 ? 'timeout' : 'inference_error' });
  }
});

// ── POST /api/ml/train ────────────────────────────────────────────────────────
router.post('/train', async (req, res) => {
  try {
    const {
      symbol = 'SPY', timeframe = '1m',
      candles = [], xgbConfig = {},
      estimatedRoundtripCostBps, snapshotPath,
    } = req.body || {};

    // Phase 9A training pipeline (JS-driven)
    if (runTraining) {
      const result = await runTraining({
        symbol: symbol.toUpperCase(), timeframe, candles, xgbConfig, estimatedRoundtripCostBps,
      });
      if (!result.ok) return res.status(422).json({ ok: false, status: 'training_unavailable', message: result.error || 'Training worker or dataset is not available.', details: { worker: 'unknown', dataset: 'missing_or_empty' } });
      return res.json({ ok: true, modelVersion: result.modelVersion, manifest: result.manifest });
    }

    // Phase 9B training pipeline (Python subprocess)
    const { spawn } = require('child_process');
    const trainScript = path.join(__dirname, 'training', 'train_pipeline.py');
    if (!fs.existsSync(trainScript)) {
      return res.status(501).json({ ok: false, status: 'training_unavailable', message: 'Training worker or dataset is not available.', details: { worker: 'stopped', dataset: 'missing_or_empty' } });
    }

    const args = ['--symbol', symbol.toUpperCase(), '--timeframe', timeframe,
                  '--output-dir', MODEL_DIR];
    if (snapshotPath) args.push('--snapshot', snapshotPath);

    let stdout = '', stderr = '';
    const proc = spawn(PYTHON_BIN || 'python3', [trainScript, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });

    const result = await new Promise((resolve, reject) => {
      proc.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Train pipeline exited (${code}): ${stderr.slice(0, 500)}`));
          return;
        }
        try { resolve(JSON.parse(stdout.trim().split('\n').pop())); }
        catch { reject(new Error(`Bad JSON from train pipeline: ${stdout.slice(0, 200)}`)); }
      });
      proc.on('error', reject);
      setTimeout(() => reject(new Error('Training timeout (10 min)')), 600_000);
    });

    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(503).json({ ok: false, status: 'training_unavailable', message: 'Training worker or dataset is not available.', error: err.message, details: { worker: 'stopped', dataset: 'missing_or_empty' } });
  }
});

const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';

// ── GET /api/ml/model-runs ────────────────────────────────────────────────────
router.get('/model-runs', (req, res) => {
  try {
    const symbol = optionalSymbol(req.query.symbol);
    const filterSymbol = req.query.symbol ? symbol : undefined;
    const raw = sqlRegistry?.list_models
      ? sqlRegistry.list_models(filterSymbol, 50)
      : (registry?.listModels ? registry.listModels(filterSymbol) : []);
    const runs = normalizeRuns(raw);
    res.json({ ok: true, runs, symbol, status: runs.length ? 'available' : 'empty' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/ml/predictions ───────────────────────────────────────────────────
router.get('/predictions', (req, res) => {
  try {
    const symbol = optionalSymbol(req.query.symbol);
    let predictions = [];
    if (evaluation?.getPredictionHistory) {
      predictions = normalizeRuns(evaluation.getPredictionHistory());
      if (req.query.symbol) predictions = predictions.filter((p) => String(p?.symbol || '').toUpperCase() === symbol);
    }
    res.json({ ok: true, predictions, symbol, status: predictions.length ? 'available' : 'empty' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/ml/feature-importance ───────────────────────────────────────────
router.get('/feature-importance', (req, res) => {
  try {
    const { modelVersion } = req.query;

    // Load from metrics.json or from registry
    const metricsPath = path.join(MODEL_DIR, 'metrics.json');
    if (fs.existsSync(metricsPath)) {
      const m = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
      const importance = m.featureImportance || m.feature_importance || {};
      const sorted = Object.entries(importance)
        .sort((a, b) => b[1] - a[1])
        .map(([feature, score]) => ({ feature, importance: score, shap_value: null }));
      return res.json({ ok: true, modelVersion: modelVersion || 'champion', features: sorted });
    }

    if (registry) {
      const champ = registry.getChampion();
      if (champ?.featureImportance) {
        const sorted = Object.entries(champ.featureImportance)
          .sort((a, b) => b[1] - a[1])
          .map(([feature, score]) => ({ feature, importance: score, shap_value: null }));
        return res.json({ ok: true, modelVersion: champ.modelVersion, features: sorted });
      }
    }

    res.json({ ok: true, features: [], status: 'no_model' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/ml/drift ─────────────────────────────────────────────────────────
router.get('/drift', (req, res) => {
  try {
    if (evaluation?.computeDriftReport) {
      const report = evaluation.computeDriftReport();
      const featureDrift = report?.featureDrift || report?.features || {};
      if (Object.keys(featureDrift).length === 0) return res.json(emptyDriftResponse());
      return res.json({
        ok: true,
        drift: {
          ...report,
          status: report.globalStatus || report.global_status || 'unknown',
          psi: Object.fromEntries(Object.entries(featureDrift).map(([key, value]) => [key, typeof value === 'number' ? value : value?.psi])),
          features: Object.entries(featureDrift).map(([feature, value]) => ({ feature, ...(typeof value === 'number' ? { psi: value } : value) })),
          lastComputedAt: report.computedAt || report.computed_at || null,
        },
      });
    }
    res.json(emptyDriftResponse());
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/ml/model-card ────────────────────────────────────────────────────
router.get('/model-card', (req, res) => {
  try {
    const cardPath = path.join(MODEL_DIR, 'model_card.md');
    const metaPath = path.join(MODEL_DIR, 'metadata.json');

    const hasMeta = fs.existsSync(metaPath);
    const hasCard = fs.existsSync(cardPath);
    if (!hasMeta && !hasCard && !getRegistryChampion()) {
      return res.json({ ok: true, modelCard: null, status: 'not_available' });
    }

    const meta = hasMeta ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
    const card = hasCard ? fs.readFileSync(cardPath, 'utf8') : null;

    const modelCard = {
      version:       meta.modelVersion || getRegistryChampion()?.modelVersion || getRegistryChampion()?.version || 'unknown',
      trainingDate:  meta.createdAt || null,
      objective:     'Intraday 3-class signal (LONG / NEUTRAL / SHORT) for 1-minute bars',
      labelDefinition: {
        horizon:     meta.horizon || 5,
        tau:         meta.tau || 0.001,
        costBps:     meta.costBps || 8,
        slippageBps: meta.slippageBps || 2,
        classMapping: { SHORT: 0, NEUTRAL: 1, LONG: 2 },
      },
      features:      meta.featureGroups || [],
      metrics:       meta.metrics || {},
      limitations:   meta.limitations || [
        'Model trained on historical data — past patterns may not persist',
        'Calibrated on val set — Brier score may degrade in live drift',
        'No guarantee of profitability after costs in live markets',
      ],
      risks: meta.risks || [
        'Feature drift: PSI > 0.20 triggers critical alert',
        'Market regime change can invalidate learned patterns',
      ],
      deployment: {
        endpoints:  ['/api/ml/infer/:symbol', '/api/ml/health', '/api/ml/model'],
        latencyP95: meta.latencyP95Ms || null,
        errorRate:  null,
      },
      guardrails:    meta.guardrails || ['provisional=true for non-canonical signals'],
      metadata: {
        datasetHash:       meta.datasetHash || '',
        featureSchemaHash: meta.featureSchemaHash || '',
        gitSha:            meta.gitSha || '',
        artifactUri:       meta.artifactUri || '',
        trainingWindowStart: meta.trainingWindowStart || '',
        trainingWindowEnd:   meta.trainingWindowEnd || '',
      },
      markdownContent: card,
    };

    res.json({ ok: true, modelCard, status: 'available', ...modelCard });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/ml/models/:version/promote ─────────────────────────────────────
router.post('/models/:version/promote', (req, res) => {
  try {
    const { version } = req.params;
    if (sqlRegistry) {
      sqlRegistry.promote_champion(version);
      const champ = sqlRegistry.get_champion();
      return res.json({ ok: true, champion: champ });
    }
    if (registry) {
      const model = registry.promoteChampion(version);
      return res.json({ ok: true, champion: model });
    }
    jsonError(res, 404, 'No registry available', { status: 'registry_unavailable' });
  } catch (err) {
    jsonError(res, 400, err.message, { status: 'promote_failed' });
  }
});

// ── Phase 9A backward-compat routes ──────────────────────────────────────────

// GET /api/ml/features/:symbol
router.get('/features/:symbol', (req, res) => {
  if (!featureStore) return res.status(501).json({ error: 'Feature store not available' });
  try {
    const sym = req.params.symbol.toUpperCase();
    const { timeframe = '1m', limit = '1', preview } = req.query;
    if (limit === '1') {
      const snap = preview === '1'
        ? featureStore.getLatest(sym, timeframe)
        : featureStore.getLatestCanonical(sym, timeframe);
      if (!snap) return res.status(404).json({ error: `No feature snapshot for ${sym}` });
      return res.json(snap);
    }
    const history = featureStore.getCanonicalHistory(sym, timeframe, 'p1_v1', Number(limit) || 100);
    res.json({ symbol: sym, timeframe, count: history.length, snapshots: history });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ml/signal/:symbol
router.get('/signal/:symbol', async (req, res) => {
  if (!featureStore) return res.status(501).json({ error: 'Feature store not available' });
  try {
    const sym = req.params.symbol.toUpperCase();
    const { timeframe = '1m', preview } = req.query;
    const lastSignal = scheduler?.getLastCanonical(sym);
    if (lastSignal && preview !== '1') return res.json(lastSignal);
    const snap = preview === '1'
      ? featureStore.getLatest(sym, timeframe)
      : featureStore.getLatestCanonical(sym, timeframe);
    if (!snap) return res.status(404).json({ error: `No feature snapshot for ${sym}` });
    const signal = await inferenceService.inferFromSnapshot(sym, snap);
    evaluation?.recordPrediction?.(signal, snap);
    res.json(signal);
  } catch (err) {
    res.status(err.message?.includes('No champion') ? 404 : 500).json({ error: err.message });
  }
});

// GET /api/ml/models
router.get('/models', (req, res) => {
  try {
    if (sqlRegistry) {
      const models = sqlRegistry.list_models(req.query.symbol || '');
      return res.json({ models, ...sqlRegistry.get_stats() });
    }
    if (registry) {
      const models = registry.listModels(req.query.symbol?.toUpperCase());
      return res.json({ models, ...registry.getStats() });
    }
    res.json({ models: [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ml/metrics
router.get('/metrics', (req, res) => {
  try {
    const result = {
      signal:   evaluation?.computeSignalMetrics?.() || null,
      drift:    evaluation?.computeDriftReport?.()   || null,
      worker:   workerPool.getPoolStatus(),
      phase9Worker: inferenceService?.getWorkerStatus?.() || null,
      features: featureStore?.getStats?.()           || null,
      registry: (sqlRegistry || registry)?.getStats?.() || null,
    };
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ml/worker/status
router.get('/worker/status', (req, res) => {
  res.json({
    pool: workerPool.getPoolStatus(),
    phase9: inferenceService?.getWorkerStatus?.() || null,
  });
});


// Keep /api/ml/* missing-route responses JSON-only so Render/Express never serves HTML for ML API paths.
router.use((req, res) => {
  res.status(404).type('application/json').json({
    ok: false,
    status: 'not_found',
    message: `ML endpoint not available: ${req.method} ${req.originalUrl}`,
    endpoint: req.originalUrl,
  });
});

router.use((err, req, res, _next) => {
  res.status(err.status || 500).type('application/json').json({
    ok: false,
    status: err.status === 404 ? 'not_found' : 'server_error',
    message: err.message || 'ML route error',
    endpoint: req.originalUrl,
  });
});

module.exports = router;
