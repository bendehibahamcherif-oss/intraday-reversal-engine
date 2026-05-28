const express = require('express');
const router = express.Router();
const orderBookEngine = require('../marketdata/orderBookEngine');
const candleBuilder = require('../marketdata/candleBuilder');
const historicalStore = require('../persistence/historicalStore');

const TIMEFRAME_MAP = {
  '1m':  { interval: '1m',  range: '1d'  },
  '5m':  { interval: '5m',  range: '5d'  },
  '15m': { interval: '15m', range: '5d'  },
  '1h':  { interval: '60m', range: '1mo' },
  '4h':  { interval: '1h',  range: '3mo' },
  '1d':  { interval: '1d',  range: '1y'  },
};

function calcEMA(values, period) {
  if (values.length < period) return values[values.length - 1] ?? null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcVWAP(candles) {
  let sumTPV = 0;
  let sumVol = 0;
  for (const c of candles) {
    const tp = (Number(c.high) + Number(c.low) + Number(c.close)) / 3;
    const vol = Number(c.volume) || 0;
    sumTPV += tp * vol;
    sumVol += vol;
  }
  return sumVol > 0 ? sumTPV / sumVol : null;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const slice = closes.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const diff = slice[i] - slice[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

async function fetchYahooCandles(symbol, timeframe, limit) {
  const { interval, range } = TIMEFRAME_MAP[timeframe] || TIMEFRAME_MAP['1m'];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ReversalTerminal/1.0)', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('Empty chart result from Yahoo');

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const { open = [], high = [], low = [], close = [], volume = [] } = quote;

  const candles = timestamps.map((ts, i) => ({
    timestamp: new Date(ts * 1000).toISOString(),
    time: ts * 1000,
    open: open[i] ?? null,
    high: high[i] ?? null,
    low: low[i] ?? null,
    close: close[i] ?? null,
    volume: volume[i] ?? 0,
    symbol,
    timeframe,
  })).filter((c) => c.close !== null && c.open !== null);

  return candles.slice(-Math.min(limit, 500));
}

function buildOrderflow(symbol) {
  const book = orderBookEngine.getBook(symbol);
  const imbalance = orderBookEngine.getImbalance(symbol);
  const topBids = book.bids.slice(0, 3);
  const topAsks = book.asks.slice(0, 3);
  const bestBid = book.bids[0]?.price;
  const bestAsk = book.asks[0]?.price;
  const spread = bestBid != null && bestAsk != null ? bestAsk - bestBid : 0;
  return { spread, imbalance, liquidityPressure: imbalance, topBids, topAsks };
}

async function getChartData(symbol, timeframe, limit) {
  let candles = [];
  let source = 'unknown';
  const warnings = [];

  try {
    candles = await fetchYahooCandles(symbol, timeframe, limit);
    source = 'yahoo';
  } catch (yahooErr) {
    warnings.push(`Yahoo fetch failed: ${yahooErr.message}`);

    const stored = await historicalStore.getCandles(symbol, timeframe, limit).catch(() => []);
    if (stored.length) {
      candles = stored.map((c) => ({ ...c, timestamp: c.timestamp || c.time || new Date(c.ts || Date.now()).toISOString() }));
      source = 'historical';
    } else {
      const live = candleBuilder.getCandles(symbol, timeframe);
      if (live.length) {
        candles = live.sort((a, b) => new Date(a.bucket) - new Date(b.bucket)).map((c) => ({ ...c, timestamp: c.bucket }));
        source = 'live';
      }
    }

    if (!candles.length) {
      source = 'fallback_demo';
      warnings.push('Using fallback demo candles because no historical data is available.');
      warnings.push('Orderbook source is fallback_demo and not live.');
    }
  }

  const closes = candles.map((c) => Number(c.close));
  const indicators = {
    vwap: calcVWAP(candles),
    ema9: calcEMA(closes, 9),
    ema20: calcEMA(closes, 20),
    rsi14: calcRSI(closes, 14),
  };

  return { candles, indicators, overlays: [], orderflow: buildOrderflow(symbol), source, warnings };
}

router.get('/payload/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = req.query.timeframe || '1m';
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const data = await getChartData(symbol, timeframe, limit);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message, source: 'error', candles: [], indicators: {}, overlays: [], orderflow: null, warnings: [err.message] });
  }
});

router.get('/candles/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = req.query.timeframe || '1m';
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const { candles, source, warnings } = await getChartData(symbol, timeframe, limit);
    res.json({ candles, source, warnings });
  } catch (err) {
    res.status(500).json({ error: err.message, candles: [] });
  }
});

router.get('/indicators/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = req.query.timeframe || '1m';
    const { indicators } = await getChartData(symbol, timeframe, 100);
    res.json({ indicators, symbol, timeframe });
  } catch (err) {
    res.status(500).json({ error: err.message, indicators: {} });
  }
});

router.get('/overlays/:symbol', (req, res) => {
  res.json({ overlays: [], symbol: req.params.symbol.toUpperCase() });
});

router.get('/orderflow/:symbol', (req, res) => {
  res.json(buildOrderflow(req.params.symbol.toUpperCase()));
});

module.exports = router;
