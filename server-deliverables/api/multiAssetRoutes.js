'use strict';

const { Router } = require('express');
const router = Router();
const historicalStore = require('../../server/persistence/historicalStore');
const engine = require('../multiAsset/multiAssetEngine');

const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA', 'TLT', 'GLD'];

function parseSymbols(str, defaults = DEFAULT_SYMBOLS) {
  if (!str) return defaults;
  return str.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 12);
}

function withStatus(payload, empty, status = 'not_enough_data') {
  return { ok: true, status: empty ? status : 'available', ...payload };
}

function parseWindow(val, min = 5, max = 252, def = 20) {
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}

// GET /api/multi-asset/correlation?symbols=SPY,QQQ,IWM&window=20&timeframe=1d
router.get('/correlation', async (req, res) => {
  try {
    const symbols   = parseSymbols(req.query.symbols);
    const window    = parseWindow(req.query.window);
    const timeframe = req.query.timeframe || '1d';
    const result = await engine.computeCorrelationMatrix(historicalStore, { symbols, window, timeframe });
    const empty = !Array.isArray(result.matrix) || result.matrix.length === 0 || result.matrix.every((row) => !Array.isArray(row) || row.every((v) => v === null || v === 1));
    res.json(withStatus(result, empty));
  } catch (err) {
    res.status(500).json({ ok: false, status: 'error', error: err.message, message: err.message });
  }
});

// GET /api/multi-asset/beta?symbol=QQQ&benchmark=SPY&window=20&timeframe=1d
router.get('/beta', async (req, res) => {
  try {
    const symbol    = (req.query.symbol    || 'QQQ').toUpperCase();
    const benchmark = (req.query.benchmark || 'SPY').toUpperCase();
    const window    = parseWindow(req.query.window);
    const timeframe = req.query.timeframe || '1d';
    const result = await engine.computeBeta(historicalStore, { symbol, benchmark, window, timeframe });
    res.json(withStatus(result, result.beta === null && result.r2 === null));
  } catch (err) {
    res.status(500).json({ ok: false, status: 'error', error: err.message, message: err.message });
  }
});

// GET /api/multi-asset/sector-rotation?window=20&timeframe=1d
router.get('/sector-rotation', async (req, res) => {
  try {
    const window    = parseWindow(req.query.window);
    const timeframe = req.query.timeframe || '1d';
    const result = await engine.computeSectorRotation(historicalStore, { window, timeframe });
    const empty = !Array.isArray(result.sectors) || result.sectors.every((s) => s.return === null);
    res.json(withStatus(result, empty));
  } catch (err) {
    res.status(500).json({ ok: false, status: 'error', error: err.message, message: err.message });
  }
});

// GET /api/multi-asset/volatility?symbols=SPY,QQQ,IWM&window=20&timeframe=1d
router.get('/volatility', async (req, res) => {
  try {
    const symbols   = parseSymbols(req.query.symbols);
    const window    = parseWindow(req.query.window);
    const timeframe = req.query.timeframe || '1d';
    const result = await engine.computeVolatility(historicalStore, { symbols, window, timeframe });
    const heatmap = result.heatmap || result.volatility || [];
    const empty = !Array.isArray(heatmap) || heatmap.every((v) => v.vol == null && v.annualizedVol == null);
    res.json(withStatus({ ...result, heatmap }, empty));
  } catch (err) {
    res.status(500).json({ ok: false, status: 'error', error: err.message, message: err.message });
  }
});


router.use((req, res) => {
  res.status(404).type('application/json').json({
    ok: false,
    status: 'not_found',
    message: `Multi-asset endpoint not available: ${req.method} ${req.originalUrl}`,
    endpoint: req.originalUrl,
  });
});

module.exports = router;
