const historicalStore = require('../persistence/historicalStore');
const broadcastEngine = require('../ws/broadcastEngine');

class DOMReplayEngine {
  async replayOrderBook(symbol, speed = 100) {
    const snapshots = await historicalStore.db
      .collection('orderbooks')
      .find({ symbol })
      .sort({ createdAt: 1 })
      .limit(500)
      .toArray();

    for (const snapshot of snapshots) {
      broadcastEngine.broadcastReplay(
        `dom:${symbol}`,
        {
          symbol,
          snapshot,
        }
      );

      await new Promise((resolve) =>
        setTimeout(resolve, speed)
      );
    }

    return {
      success: true,
      replayed: snapshots.length,
    };
  }
}

module.exports = new DOMReplayEngine();
