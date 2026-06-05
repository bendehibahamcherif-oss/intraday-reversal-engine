'use strict';

const { Router } = require('express');
const fs     = require('fs');
const router = Router();
const historicalStore = require('../../server/persistence/historicalStore');
const engine = require('../multiAsset/multiAssetEngine');
const { logReturns, pearsonCorrelation } = engine._internal;

const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA', 'TLT', 'GLD'];

function parseSymbols(str, defaults = DEFAULT_SYMBOLS) {
  if (!str) return defaults;
  return str.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 12);
}

function parseWindow(val, min = 5, max = 252, def = 20) {
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}

// GET /api/multi-asset/correlation?symbols=SPY,QQQ,IWM&window=20&timeframe=1d[&datasetId=...]
router.get('/correlation', async (req, res) => {
  try {
    const symbols   = parseSymbols(req.query.symbols);
    const window    = parseWindow(req.query.window);
    const timeframe = req.query.timeframe || '1d';
    const datasetId = req.query.datasetId || null;

    // ── Dataset-backed correlation ──────────────────────────────────────────
    if (datasetId) {
      const registry = require('../historical/historicalDatasetRegistry');
      const dataset  = registry.get(datasetId);

      if (!dataset) {
        return res.status(404).json({ ok: false, error: 'dataset_not_found' });
      }

      // Load candle data from CSV or JSON
      let candles = [];
      if (dataset.files && dataset.files.csv && fs.existsSync(dataset.files.csv)) {
        const raw = fs.readFileSync(dataset.files.csv, 'utf8');
        const lines = raw.split('\n').filter(Boolean);
        // Skip header line
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',');
          // CSV header: timestamp,symbol,timeframe,open,high,low,close,volume,...
          if (parts.length >= 7) {
            candles.push({
              timestamp: parts[0],
              symbol:    parts[1],
              timeframe: parts[2],
              open:      parts[3],
              high:      parts[4],
              low:       parts[5],
              close:     parts[6],
              volume:    parts[7] || '0',
            });
          }
        }
      } else if (dataset.files && dataset.files.json && fs.existsSync(dataset.files.json)) {
        candles = JSON.parse(fs.readFileSync(dataset.files.json, 'utf8'));
      } else {
        return res.status(404).json({ ok: false, error: 'dataset_files_not_found' });
      }

      // Derive the symbol list from query params or the dataset's own symbol list
      const parsedSymbols = (req.query.symbols)
        ? parseSymbols(req.query.symbols)
        : (dataset.symbols || []);

      // Group closes by symbol
      const closesBySymbol = {};
      candles.forEach((c) => {
        const sym = String(c.symbol).toUpperCase();
        if (!closesBySymbol[sym]) closesBySymbol[sym] = [];
        const cl = Number(c.close);
        if (cl > 0) closesBySymbol[sym].push(cl);
      });

      // Compute correlation matrix directly from loaded closes
      const observations = Math.max(...parsedSymbols.map((s) => (closesBySymbol[s] || []).length), 0);

      if (observations < 2) {
        return res.json({
          ok:           true,
          datasetId,
          symbols:      parsedSymbols,
          matrix:       [],
          observations: 0,
          window,
          status:       'not_enough_data',
          message:      'Not enough data points to compute correlation. Need at least 2 observations per symbol.',
        });
      }

      const matrix = parsedSymbols.map((a) =>
        parsedSymbols.map((b) => {
          if (a === b) return 1;
          const closesA = (closesBySymbol[a] || []);
          const closesB = (closesBySymbol[b] || []);
          const returnsA = logReturns(closesA).slice(-window);
          const returnsB = logReturns(closesB).slice(-window);
          const corr = pearsonCorrelation(returnsA, returnsB);
          return corr !== null ? parseFloat(corr.toFixed(4)) : null;
        })
      );

      return res.json({
        ok:           true,
        datasetId,
        symbols:      parsedSymbols,
        matrix,
        observations,
        window,
        status:       'ok',
      });
    }

    // ── Default: live historicalStore-backed correlation ────────────────────
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
