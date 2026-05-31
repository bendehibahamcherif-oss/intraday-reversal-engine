'use strict';

/**
 * ML Signal Engine REST routes — Phase 9A.
 *
 * Mount at: app.use('/api/ml', mlRoutes)
 *
 * GET  /api/ml/features/:symbol   — latest P1 feature snapshot
 * GET  /api/ml/signal/:symbol     — latest canonical signal (or preview if ?preview=1)
 * POST /api/ml/train              — trigger training pipeline
 * GET  /api/ml/models             — list model registry
 * GET  /api/ml/models/:version    — get model by version
 * POST /api/ml/models/:version/promote — promote to champion
 * GET  /api/ml/metrics            — signal quality metrics + drift
 * GET  /api/ml/worker/status      — Python worker status
 */

const { Router } = require('express');

const featureStore      = require('./featureStore');
const registry          = require('./modelRegistry');
const { runTraining }   = require('./trainingPipeline');
const inferenceService  = require('./inferenceService');
const evaluation        = require('./evaluationService');
const scheduler         = require('./liveSignalScheduler');

const router = Router();

// ── GET /api/ml/features/:symbol ─────────────────────────────────────────────
router.get('/features/:symbol', (req, res) => {
  try {
    const { symbol }    = req.params;
    const { timeframe = '1m', limit = '1', preview } = req.query;

    const sym = symbol.toUpperCase();

    if (limit === '1' || !limit) {
      const snap = preview === '1'
        ? featureStore.getLatest(sym, timeframe)
        : featureStore.getLatestCanonical(sym, timeframe);

      if (!snap) return res.status(404).json({ error: `No feature snapshot found for ${sym}` });
      return res.json(snap);
    }

    const history = featureStore.getCanonicalHistory(sym, timeframe, 'p1_v1', Number(limit) || 100);
    res.json({ symbol: sym, timeframe, count: history.length, snapshots: history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/ml/signal/:symbol ────────────────────────────────────────────────
router.get('/signal/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '1m', preview } = req.query;
    const sym = symbol.toUpperCase();

    // Return last computed signal (canonical or provisional)
    const lastSignal = scheduler.getLastCanonical(sym);
    if (lastSignal && preview !== '1') return res.json(lastSignal);

    // Fallback: compute from latest snapshot
    const snap = preview === '1'
      ? featureStore.getLatest(sym, timeframe)
      : featureStore.getLatestCanonical(sym, timeframe);

    if (!snap) {
      return res.status(404).json({ error: `No feature snapshot for ${sym} — run inference first or await 1m bar close` });
    }

    const signal = await inferenceService.inferFromSnapshot(sym, snap);
    evaluation.recordPrediction(signal, snap);
    res.json(signal);
  } catch (err) {
    res.status(err.message?.includes('No champion') ? 404 : 500).json({ error: err.message });
  }
});

// ── POST /api/ml/train ────────────────────────────────────────────────────────
router.post('/train', async (req, res) => {
  try {
    const { symbol = 'SPY', timeframe = '1m', candles = [], xgbConfig = {}, estimatedRoundtripCostBps } = req.body || {};
    const result = await runTraining({ symbol: symbol.toUpperCase(), timeframe, candles, xgbConfig, estimatedRoundtripCostBps });
    if (!result.ok) return res.status(422).json({ error: result.error });
    res.json({ ok: true, modelVersion: result.modelVersion, manifest: result.manifest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/ml/models ────────────────────────────────────────────────────────
router.get('/models', (req, res) => {
  try {
    const { symbol } = req.query;
    const models = registry.listModels(symbol?.toUpperCase());
    const stats  = registry.getStats();
    res.json({ models, ...stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/ml/models/:version ───────────────────────────────────────────────
router.get('/models/:version', (req, res) => {
  try {
    const model = registry.getModel(req.params.version);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    res.json(model);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/ml/models/:version/promote ─────────────────────────────────────
router.post('/models/:version/promote', (req, res) => {
  try {
    const model = registry.promoteChampion(req.params.version);
    res.json({ ok: true, champion: model });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/ml/metrics ───────────────────────────────────────────────────────
router.get('/metrics', (req, res) => {
  try {
    const signalMetrics = evaluation.computeSignalMetrics();
    const driftReport   = evaluation.computeDriftReport();
    const workerStatus  = inferenceService.getWorkerStatus();
    const featureStats  = featureStore.getStats();
    res.json({
      signal:  signalMetrics,
      drift:   driftReport,
      worker:  workerStatus,
      features: featureStats,
      registry: registry.getStats(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/ml/worker/status ─────────────────────────────────────────────────
router.get('/worker/status', (req, res) => {
  res.json(inferenceService.getWorkerStatus());
});

module.exports = router;
