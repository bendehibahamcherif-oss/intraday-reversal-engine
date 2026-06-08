'use strict';

const { Router } = require('express');
const fs     = require('fs');
const { sanitizeJson } = require('./jsonSafety');
const router = Router();
const historicalStore = require('../../server/persistence/historicalStore');
const engine = require('../multiAsset/multiAssetEngine');
const { logReturns, pearsonCorrelation, annualizedVol } = engine._internal;

const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA', 'TLT', 'GLD'];

const SECTOR_ETF_SYMBOLS = new Set(engine.SECTOR_ETFS.map((e) => e.symbol));

function parseSymbols(str, defaults = DEFAULT_SYMBOLS) {
  if (!str) return defaults;
  return str.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 12);
}

function withStatus(payload, empty, status = 'not_enough_data') {
  return sanitizeJson({ ok: true, status: empty ? status : 'available', ...payload });
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function loadDatasetCandles(dataset) {
  // Canonical CSV format: timestamp,symbol,timeframe,open,high,low,close,volume,provider,session,sourceType,adjusted
  if (dataset.files?.csv && fs.existsSync(dataset.files.csv)) {
    const lines = fs.readFileSync(dataset.files.csv, 'utf8').split('\n').filter(Boolean);
    return lines.slice(1).map((line) => {
      const parts = line.split(',');
      return { timestamp: parts[0], symbol: String(parts[1] || '').toUpperCase(), close: safeNumber(parts[6]) };
    }).filter((c) => c.timestamp && c.symbol && c.close !== null);
  }
  if (dataset.files?.json && fs.existsSync(dataset.files.json)) {
    return JSON.parse(fs.readFileSync(dataset.files.json, 'utf8')).map((c) => ({ timestamp: c.timestamp, symbol: String(c.symbol || '').toUpperCase(), close: safeNumber(c.close) })).filter((c) => c.timestamp && c.symbol && c.close !== null);
  }
  return null;
}

function detectMissingSymbols(candles, symbols) {
  const available = new Set(candles.map((c) => c.symbol));
  const missingSymbols = symbols.filter((s) => !available.has(s));
  const availableSymbols = symbols.filter((s) => available.has(s));
  return { missingSymbols, availableSymbols };
}

function missingSymbolsResponse(datasetId, requestedSymbols, availableSymbols, missingSymbols) {
  return {
    ok: false,
    status: 'missing_symbols',
    message: `Dataset does not contain all requested symbols. Missing: ${missingSymbols.join(', ')}. Available in dataset: ${availableSymbols.join(', ') || '(none)'}. Select a dataset that includes all symbols, or remove the missing symbols from the request.`,
    datasetId: datasetId || null,
    requestedSymbols,
    availableSymbols,
    missingSymbols,
  };
}

function returnsBySymbol(candles, symbols) {
  const grouped = {};
  for (const symbol of symbols) grouped[symbol] = [];
  for (const c of candles) if (grouped[c.symbol]) grouped[c.symbol].push(c);
  const out = {};
  for (const symbol of symbols) {
    const sorted = grouped[symbol].slice().sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    out[symbol] = [];
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1].close;
      const cur = sorted[i].close;
      if (prev > 0 && cur > 0) {
        const value = Math.log(cur / prev);
        if (Number.isFinite(value)) out[symbol].push({ timestamp: sorted[i].timestamp, value });
      }
    }
  }
  return out;
}

function alignedPair(aReturns, bReturns, window) {
  const bMap = new Map(bReturns.map((r) => [r.timestamp, r.value]));
  const a = [];
  const b = [];
  for (const r of aReturns) {
    if (bMap.has(r.timestamp)) {
      const bv = bMap.get(r.timestamp);
      if (Number.isFinite(r.value) && Number.isFinite(bv)) { a.push(r.value); b.push(bv); }
    }
  }
  return [a.slice(-window), b.slice(-window)];
}

function safeCorrelation(a, b) {
  if (a.length < 2 || b.length < 2 || a.length !== b.length) return null;
  const corr = pearsonCorrelation(a, b);
  return Number.isFinite(corr) ? Number(corr.toFixed(4)) : null;
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
        return res.status(404).json({ ok: false, status: 'dataset_not_found', message: 'Historical dataset not found.', datasetId });
      }

      const candles = loadDatasetCandles(dataset);
      if (!candles) {
        return res.status(404).json({ ok: false, status: 'dataset_file_missing', message: 'Historical dataset exists but no usable CSV/JSON file was found.', datasetId });
      }

      const parsedSymbols = req.query.symbols ? parseSymbols(req.query.symbols) : (dataset.symbols || []);

      // Detect missing symbols before attempting calculation
      const { missingSymbols, availableSymbols } = detectMissingSymbols(candles, parsedSymbols);
      if (missingSymbols.length > 0) {
        return res.json(sanitizeJson(missingSymbolsResponse(datasetId, parsedSymbols, availableSymbols, missingSymbols)));
      }

      const returns = returnsBySymbol(candles, parsedSymbols);
      let observations = 0;
      const matrix = parsedSymbols.map((a) => parsedSymbols.map((b) => {
        if (a === b) return 1;
        const [ra, rb] = alignedPair(returns[a] || [], returns[b] || [], window);
        observations = Math.max(observations, Math.min(ra.length, rb.length));
        return safeCorrelation(ra, rb);
      }));

      if (observations < 2) {
        return res.json(sanitizeJson({ ok: true, datasetId, symbols: parsedSymbols, matrix: [], observations: 0, window, timeframe, status: 'not_enough_data', message: `Not enough overlapping observations for window ${window}. Got ${observations}. Increase date range or reduce window.` }));
      }

      // Build pairs for convenience
      const pairs = [];
      for (let i = 0; i < parsedSymbols.length; i++) {
        for (let j = i + 1; j < parsedSymbols.length; j++) {
          pairs.push({ x: parsedSymbols[i], y: parsedSymbols[j], correlation: matrix[i][j] });
        }
      }

      return res.json(sanitizeJson({ ok: true, status: 'ok', datasetId, symbols: parsedSymbols, matrix, pairs, observations, window, timeframe }));
    }

    // ── Default: live historicalStore-backed correlation ────────────────────
    const result = await engine.computeCorrelationMatrix(historicalStore, { symbols, window, timeframe });
    const empty = !Array.isArray(result.matrix) || result.matrix.length === 0 || result.matrix.every((row) => !Array.isArray(row) || row.every((v) => v === null || v === 1));
    res.json(withStatus(result, empty));
  } catch (err) {
    res.status(500).json({ ok: false, status: 'error', error: err.message, message: err.message });
  }
});

// GET /api/multi-asset/beta?symbol=QQQ&benchmark=SPY&window=20&timeframe=1d[&datasetId=...]
router.get('/beta', async (req, res) => {
  try {
    const symbol    = (req.query.symbol    || 'QQQ').toUpperCase();
    const benchmark = (req.query.benchmark || 'SPY').toUpperCase();
    const window    = parseWindow(req.query.window);
    const timeframe = req.query.timeframe || '1d';
    const datasetId = req.query.datasetId || null;
    if (datasetId) {
      const registry = require('../historical/historicalDatasetRegistry');
      const dataset = registry.get(datasetId);
      if (!dataset) return res.status(404).json({ ok: false, status: 'dataset_not_found', message: 'Historical dataset not found.', datasetId });
      const candles = loadDatasetCandles(dataset);
      if (!candles) return res.status(404).json({ ok: false, status: 'dataset_file_missing', message: 'Historical dataset exists but no usable CSV/JSON file was found.', datasetId });

      // Detect missing symbols for asset and benchmark
      const { missingSymbols, availableSymbols } = detectMissingSymbols(candles, [symbol, benchmark]);
      if (missingSymbols.length > 0) {
        return res.json(sanitizeJson(missingSymbolsResponse(datasetId, [symbol, benchmark], availableSymbols, missingSymbols)));
      }

      const returns = returnsBySymbol(candles, [symbol, benchmark]);
      const [assetReturns, benchmarkReturns] = alignedPair(returns[symbol] || [], returns[benchmark] || [], window);
      if (assetReturns.length < 2 || benchmarkReturns.length < 2) {
        return res.json({ ok: true, datasetId, asset: symbol, symbol, benchmark, beta: null, r2: null, observations: assetReturns.length, status: 'not_enough_data', message: `Not enough overlapping observations for window ${window}. Got ${assetReturns.length}. Increase date range or reduce window.` });
      }
      const corr = safeCorrelation(assetReturns, benchmarkReturns);
      const meanFn = (arr) => arr.reduce((sum, v) => sum + v, 0) / arr.length;
      const bm = meanFn(benchmarkReturns);
      const am = meanFn(assetReturns);
      const variance = benchmarkReturns.reduce((sum, v) => sum + ((v - bm) ** 2), 0);
      const covariance = assetReturns.reduce((sum, v, i) => sum + ((v - am) * (benchmarkReturns[i] - bm)), 0);
      const beta = variance > 0 ? covariance / variance : null;
      return res.json(sanitizeJson({ ok: true, status: beta !== null ? 'ok' : 'not_enough_data', datasetId, asset: symbol, symbol, benchmark, beta: Number.isFinite(beta) ? Number(beta.toFixed(4)) : null, r2: corr !== null ? Number((corr * corr).toFixed(4)) : null, observations: assetReturns.length, window, timeframe, ...(beta === null ? { message: 'Not enough variance in benchmark returns.' } : {}) }));
    }
    const result = await engine.computeBeta(historicalStore, { symbol, benchmark, window, timeframe });
    res.json(sanitizeJson(withStatus(result, result.beta === null && result.r2 === null)));
  } catch (err) {
    res.status(500).json({ ok: false, status: 'error', error: err.message, message: err.message });
  }
});

// GET /api/multi-asset/sector-rotation?window=20&timeframe=1d[&symbols=SPY,NFLX&datasetId=...]
router.get('/sector-rotation', async (req, res) => {
  try {
    const window    = parseWindow(req.query.window);
    const timeframe = req.query.timeframe || '1d';
    const datasetId = req.query.datasetId || null;
    const userSymbols = req.query.symbols ? parseSymbols(req.query.symbols) : null;

    // If a dataset is selected or user-specified symbols are not standard sector ETFs,
    // sector rotation is not available — return structured not_available response.
    if (datasetId || (userSymbols && userSymbols.some((s) => !SECTOR_ETF_SYMBOLS.has(s)))) {
      const symbols = userSymbols || [];
      return res.json({
        ok: true,
        status: 'not_available',
        reason: 'sector_metadata_missing',
        message: 'Sector rotation requires standard sector ETF classifications (XLK, XLF, XLV, XLE, XLI, XLY, XLC, XLU, XLB, XLRE). The requested symbols do not map to sector ETFs. Dataset-backed sector rotation is not supported.',
        symbols,
        window,
        timeframe,
      });
    }

    // Default: live ETF proxy sector rotation
    const result = await engine.computeSectorRotation(historicalStore, { window, timeframe });
    const empty = !Array.isArray(result.sectors) || result.sectors.every((s) => s.return === null);
    res.json(withStatus(result, empty));
  } catch (err) {
    res.status(500).json({ ok: false, status: 'error', error: err.message, message: err.message });
  }
});

// GET /api/multi-asset/volatility?symbols=SPY,QQQ,IWM&window=20&timeframe=1d[&datasetId=...]
async function handleVolatility(req, res) {
  try {
    const symbols   = parseSymbols(req.query.symbols);
    const window    = parseWindow(req.query.window);
    const timeframe = req.query.timeframe || '1d';
    const datasetId = req.query.datasetId || null;

    // ── Dataset-backed volatility ─────────────────────────────────────────────
    if (datasetId) {
      const registry = require('../historical/historicalDatasetRegistry');
      const dataset  = registry.get(datasetId);

      if (!dataset) {
        return res.status(404).json({ ok: false, status: 'dataset_not_found', message: 'Historical dataset not found.', datasetId });
      }

      const candles = loadDatasetCandles(dataset);
      if (!candles) {
        return res.status(404).json({ ok: false, status: 'dataset_file_missing', message: 'Historical dataset exists but no usable CSV/JSON file was found.', datasetId });
      }

      const parsedSymbols = req.query.symbols ? parseSymbols(req.query.symbols) : (dataset.symbols || []);

      // Detect missing symbols
      const { missingSymbols, availableSymbols } = detectMissingSymbols(candles, parsedSymbols);
      if (missingSymbols.length > 0) {
        return res.json(sanitizeJson(missingSymbolsResponse(datasetId, parsedSymbols, availableSymbols, missingSymbols)));
      }

      const returnMap = returnsBySymbol(candles, parsedSymbols);
      const results = parsedSymbols.map((symbol) => {
        const rets = (returnMap[symbol] || []).map((r) => r.value);
        const vol = rets.length >= 2 ? annualizedVol(rets, window) : null;

        // Compute cumulative return over window
        const sorted = (returnMap[symbol] || []).slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        const windowSlice = sorted.slice(-window - 1);
        let cumReturn = null;
        if (windowSlice.length >= 2) {
          // Reconstruct level from log returns
          cumReturn = windowSlice.slice(1).reduce((sum, r) => sum + r.value, 0);
          cumReturn = Number.isFinite(cumReturn) ? Number((Math.exp(cumReturn) - 1).toFixed(4)) : null;
        }

        return {
          symbol,
          vol:          vol !== null ? Number(vol.toFixed(4)) : null,
          annualizedVol: vol !== null ? Number(vol.toFixed(4)) : null,
          return:       cumReturn,
        };
      });

      const empty = results.every((r) => r.vol === null);
      const heatmap = results;
      return res.json(sanitizeJson(withStatus({ volatility: results, heatmap, datasetId, symbols: parsedSymbols, window, timeframe, computedAt: new Date().toISOString() }, empty, 'not_enough_data')));
    }

    // ── Default: live historicalStore-backed volatility ─────────────────────
    const result = await engine.computeVolatility(historicalStore, { symbols, window, timeframe });
    const heatmap = result.heatmap || result.volatility || [];
    const empty = !Array.isArray(heatmap) || heatmap.every((v) => v.vol == null && v.annualizedVol == null);
    res.json(withStatus({ ...result, heatmap }, empty));
  } catch (err) {
    res.status(500).json({ ok: false, status: 'error', error: err.message, message: err.message });
  }
}

router.get('/volatility', handleVolatility);
router.get('/volatility-heatmap', handleVolatility);

router.use((req, res) => {
  res.status(404).type('application/json').json({
    ok: false,
    status: 'not_found',
    message: `Multi-asset endpoint not available: ${req.method} ${req.originalUrl}`,
    endpoint: req.originalUrl,
  });
});

module.exports = router;
