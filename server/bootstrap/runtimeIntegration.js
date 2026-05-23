const wsBootstrap = require('../ws/wsBootstrap');
const replayRoutes = require('../api/replaySessionRoutes');
const realtimeReplayRoutes = require('../api/realtimeReplayRoutes');
const replayRoutesLegacy = require('../api/replayRoutes');
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

  app.use('/api/replay', limiter, replayRoutes);
  app.use('/api/realtime-replay', limiter, realtimeReplayRoutes);
  app.use('/api/replay-legacy', limiter, replayRoutesLegacy);

  const wsRuntime = wsBootstrap(wss);

  return {
    wsRuntime,
    replayCoordinator,
    replayControlEngine,
    historicalStore,
  };
}

module.exports = integrateRuntime;
