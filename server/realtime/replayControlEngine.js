const replayStateStore = require('./replayStateStore');
const replayCoordinator = require('./replayCoordinator');

class ReplayControlEngine {
  async start(sessionId, symbol, options = {}) {
    replayStateStore.createSession(sessionId, {
      symbol,
      status: 'running',
      speed: options.speed || 50,
      timeframe: options.timeframe || '1m',
    });

    const result = await replayCoordinator.startFullReplay(
      symbol,
      options
    );

    replayStateStore.updateSession(sessionId, {
      status: 'completed',
      completedAt: Date.now(),
    });

    return result;
  }

  pause(sessionId) {
    return replayStateStore.updateSession(sessionId, {
      status: 'paused',
      pausedAt: Date.now(),
    });
  }

  resume(sessionId) {
    return replayStateStore.updateSession(sessionId, {
      status: 'running',
      resumedAt: Date.now(),
    });
  }

  stop(sessionId) {
    return replayStateStore.updateSession(sessionId, {
      status: 'stopped',
      stoppedAt: Date.now(),
    });
  }
}

module.exports = new ReplayControlEngine();
