const express = require('express');
const router = express.Router();
const orderBookEngine = require('../marketdata/orderBookEngine');
const candleBuilder = require('../marketdata/candleBuilder');
const historicalStore = require('../persistence/historicalStore');

const KNOWN_PROVIDERS = [
  { name: 'yahoo', credentialsRequired: false, defaultStatus: 'delayed' },
  { name: 'twelvedata', credentialsRequired: true, defaultStatus: 'inactive' },
  { name: 'polygon', credentialsRequired: true, defaultStatus: 'inactive' },
  { name: 'alphaVantage', credentialsRequired: true, defaultStatus: 'inactive' },
  { name: 'ibkr', credentialsRequired: true, defaultStatus: 'requires_setup' },
  { name: 'fallback_demo', credentialsRequired: false, defaultStatus: 'idle_demo' },
];

const state = {
  activeProviders: ['yahoo'],
  symbols: [],
};

router.get('/status', (_req, res) => {
  const statuses = KNOWN_PROVIDERS.map((p) => ({
    source: p.name,
    status: `NOT_CONNECTED (${p.name})`,
    connected: false,
    symbols: [],
    lastMessageAt: null,
    latencyMs: null,
    warnings: p.name === 'yahoo'
      ? ['Yahoo is fallback/delayed/unofficial data and not institutional real-time.']
      : [],
  }));

  res.json({
    activeProviders: state.activeProviders,
    providerOrder: state.activeProviders,
    source: state.activeProviders[0] || 'fallback_demo',
    connected: false,
    warnings: [],
    statuses,
    providers: KNOWN_PROVIDERS.map((p) => p.name),
  });
});

router.get('/status/:source', (req, res) => {
  const provider = KNOWN_PROVIDERS.find((p) => p.name === req.params.source);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });
  res.json({
    source: provider.name,
    status: `NOT_CONNECTED (${provider.name})`,
    connected: false,
    symbols: [],
    lastMessageAt: null,
    warnings: provider.name === 'yahoo' ? ['Yahoo is fallback/delayed/unofficial data.'] : [],
  });
});

router.get('/providers', (_req, res) => {
  res.json({
    providers: KNOWN_PROVIDERS.map((p) => ({
      name: p.name,
      source: p.name,
      status: p.defaultStatus,
      credentialsStatus: p.credentialsRequired ? 'missing_credentials' : 'not_required',
      connected: false,
    })),
  });
});

router.get('/providers/active', (_req, res) => {
  res.json({
    providers: state.activeProviders,
    providerOrder: state.activeProviders,
    enabledByProvider: Object.fromEntries(state.activeProviders.map((p) => [p, true])),
    symbols: state.symbols,
  });
});

router.post('/providers/active', (req, res) => {
  const { providers = [], symbols = [] } = req.body || {};
  const valid = providers.filter((p) => typeof p === 'string' && p.trim());
  if (valid.length) state.activeProviders = valid;
  state.symbols = symbols;
  res.json({
    ok: true,
    providers: state.activeProviders,
    providerOrder: state.activeProviders,
    enabledByProvider: Object.fromEntries(state.activeProviders.map((p) => [p, true])),
    symbols: state.symbols,
  });
});

router.get('/providers/:provider', (req, res) => {
  const provider = KNOWN_PROVIDERS.find((p) => p.name === req.params.provider);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });
  res.json({
    name: provider.name,
    source: provider.name,
    status: provider.defaultStatus,
    credentialsStatus: provider.credentialsRequired ? 'missing_credentials' : 'not_required',
    connected: false,
  });
});

router.post('/providers/:provider/credentials', (req, res) => {
  res.json({ ok: true, credentialsStatus: 'configured', provider: req.params.provider });
});

router.delete('/providers/:provider/credentials', (req, res) => {
  res.json({ ok: true, credentialsStatus: 'missing_credentials', provider: req.params.provider });
});

router.post('/start', (req, res) => {
  res.json({ ok: true, status: 'started', source: req.body?.source });
});

router.post('/stop', (req, res) => {
  res.json({ ok: true, status: 'stopped', source: req.body?.source });
});

router.get('/tick/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const ticks = await historicalStore.getTicks(symbol, 1);
    res.json({ tick: ticks[0] || null, symbol, source: ticks.length ? 'historical' : 'none' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/candle/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = req.query.timeframe || '1m';
    const liveCandles = candleBuilder.getCandles(symbol, timeframe);
    if (liveCandles.length) {
      const latest = liveCandles.sort((a, b) => new Date(b.bucket) - new Date(a.bucket))[0];
      return res.json({ candle: latest, symbol, timeframe, source: 'live' });
    }
    const stored = await historicalStore.getCandles(symbol, timeframe, 1);
    res.json({ candle: stored[0] || null, symbol, timeframe, source: stored.length ? 'historical' : 'none' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/orderbook/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const book = orderBookEngine.getBook(symbol);
  res.json({
    symbol,
    bids: book.bids,
    asks: book.asks,
    imbalance: orderBookEngine.getImbalance(symbol),
    updatedAt: book.updatedAt || null,
    source: 'live',
  });
});

router.get('/demo/tick/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const price = 100 + Math.random() * 10;
  res.json({
    tick: { symbol, price, bid: price - 0.01, ask: price + 0.01, volume: Math.floor(Math.random() * 1000), timestamp: new Date().toISOString(), source: 'demo' },
    source: 'demo',
  });
});

router.get('/demo/candle/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const price = 100 + Math.random() * 10;
  res.json({
    candle: { symbol, open: price, high: price + 1, low: price - 1, close: price + 0.5, volume: 10000, timestamp: new Date().toISOString(), source: 'demo' },
    source: 'demo',
  });
});

router.get('/demo/orderbook/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const price = 100 + Math.random() * 10;
  res.json({
    bids: [{ price: price - 0.01, size: 100 }, { price: price - 0.02, size: 200 }],
    asks: [{ price: price + 0.01, size: 100 }, { price: price + 0.02, size: 200 }],
    imbalance: 0.1,
    source: 'demo',
  });
});

module.exports = router;
