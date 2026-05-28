const wsBootstrap = require('../ws/wsBootstrap');
const replayRoutes = require('../api/replaySessionRoutes');
const realtimeReplayRoutes = require('../api/realtimeReplayRoutes');
const replayRoutesLegacy = require('../api/replayRoutes');
const feedRoutes = require('../api/feedRoutes');
const chartRoutes = require('../api/chartRoutes');
const rateLimiter = require('../security/rateLimiter');
const historicalStore = require('../persistence/historicalStore');
const replayCoordinator = require('../realtime/replayCoordinator');
const replayControlEngine = require('../realtime/replayControlEngine');

function integrateRuntime({
  app,
  wss,
  mongoDb,
}) {
  if (mongoDb) {
    historicalStore.setDatabase(mongoDb);
  }

  const limiter = rateLimiter.middleware();

  app.use('/api/feeds', limiter, feedRoutes);
  app.use('/api/chart', limiter, chartRoutes);
  app.use('/api/replay', limiter, replayRoutes);
  app.use('/api/replay-session', limiter, replayRoutes);
  app.use('/api/realtime-replay', limiter, realtimeReplayRoutes);
  app.use('/api/replay-legacy', limiter, replayRoutesLegacy);

  // Yahoo Finance proxy (used by legacy frontend code)
  app.get('/yahoo/chart/:symbol', limiter, async (req, res) => {
    try {
      const symbol = encodeURIComponent(req.params.symbol.toUpperCase());
      const interval = req.query.interval || '1m';
      const range = req.query.range || '1d';
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}&includePrePost=false`;
      const yRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, signal: AbortSignal.timeout(12000) });
      const data = await yRes.json();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  const wsRuntime = wsBootstrap(wss);

  return {
    wsRuntime,
    replayCoordinator,
    replayControlEngine,
    historicalStore,
  };
}

module.exports = integrateRuntime;
