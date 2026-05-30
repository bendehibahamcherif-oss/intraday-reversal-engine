'use strict';

const { Router } = require('express');
const router = Router();
const historicalStore = require('../persistence/historicalStore');
const engine = require('../multiAsset/multiAssetEngine');

const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA', 'TLT', 'GLD'];

function parseSymbols(str, defaults = DEFAULT_SYMBOLS) {
  if (!str) return defaults;
  return str.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 12);
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
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/multi-asset/sector-rotation?window=20&timeframe=1d
router.get('/sector-rotation', async (req, res) => {
  try {
    const window    = parseWindow(req.query.window);
    const timeframe = req.query.timeframe || '1d';
    const result = await engine.computeSectorRotation(historicalStore, { window, timeframe });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/multi-asset/volatility?symbols=SPY,QQQ,IWM&window=20&timeframe=1d
router.get('/volatility', async (req, res) => {
  try {
    const symbols   = parseSymbols(req.query.symbols);
    const window    = parseWindow(req.query.window);
    const timeframe = req.query.timeframe || '1d';
    const result = await engine.computeVolatility(historicalStore, { symbols, window, timeframe });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
