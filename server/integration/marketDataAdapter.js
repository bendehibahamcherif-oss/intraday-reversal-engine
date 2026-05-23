const liveMarketPipeline = require('../marketdata/liveMarketPipeline');

class MarketDataAdapter {
  ingestTick(feed, payload) {
    return liveMarketPipeline.processTick({
      symbol: payload.symbol,
      price: payload.price,
      volume: payload.volume,
      side: payload.side,
      sequence: payload.sequence,
      time: payload.time || Date.now(),
      source: feed,
    });
  }

  ingestOrderBook(feed, symbol, levels = []) {
    return liveMarketPipeline.processOrderBook(
      symbol,
      levels.map((level) => ({
        ...level,
        source: feed,
      }))
    );
  }
}

module.exports = new MarketDataAdapter();
