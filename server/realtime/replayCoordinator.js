const liveReplayEngine = require('./liveReplayEngine');
const domReplayEngine = require('./domReplayEngine');
const tickReplayEngine = require('./tickReplayEngine');

class ReplayCoordinator {
  async startFullReplay(symbol, options = {}) {
    const speed = options.speed || 50;

    return Promise.all([
      liveReplayEngine.replayCandles(
        symbol,
        options.timeframe || '1m',
        speed
      ),

      domReplayEngine.replayOrderBook(
        symbol,
        speed
      ),

      tickReplayEngine.replayTicks(
        symbol,
        Math.max(5, speed / 2)
      ),
    ]);
  }
}

module.exports = new ReplayCoordinator();
