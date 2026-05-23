const historicalStore = require('../persistence/historicalStore');
const broadcastEngine = require('../ws/broadcastEngine');

class LiveReplayEngine {
  async replayCandles(symbol, timeframe = '1m', speed = 100) {
    const candles = await historicalStore.getCandles(
      symbol,
      timeframe,
      500
    );

    const ordered = [...candles].reverse();

    for (const candle of ordered) {
      broadcastEngine.broadcastReplay(
        `replay:${symbol}`,
        {
          symbol,
          timeframe,
          candle,
        }
      );

      await new Promise((resolve) =>
        setTimeout(resolve, speed)
      );
    }

    return {
      success: true,
      replayed: ordered.length,
    };
  }
}

module.exports = new LiveReplayEngine();
