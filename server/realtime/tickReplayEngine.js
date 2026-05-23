const historicalStore = require('../persistence/historicalStore');
const broadcastEngine = require('../ws/broadcastEngine');

class TickReplayEngine {
  async replayTicks(symbol, speed = 25) {
    const ticks = await historicalStore.getTicks(
      symbol,
      5000
    );

    const ordered = [...ticks].reverse();

    for (const tick of ordered) {
      broadcastEngine.broadcastReplay(
        `ticks:${symbol}`,
        {
          symbol,
          tick,
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

module.exports = new TickReplayEngine();
