const candleBuilder = require('./candleBuilder');
const tickAggregator = require('./tickAggregator');
const orderBookEngine = require('./orderBookEngine');
const broadcastEngine = require('../ws/broadcastEngine');
const recoveryEngine = require('../ws/recoveryEngine');
const livePersistencePipeline = require('../persistence/livePersistencePipeline');

class LiveMarketPipeline {
  async processTick(rawTick) {
    const tick = tickAggregator.process(rawTick);

    if (!tick) {
      return null;
    }

    const gap = recoveryEngine.detectGap(
      `market:${tick.symbol}`,
      tick.sequence
    );

    if (gap.gap) {
      console.warn(
        `Sequence gap detected ${tick.symbol} expected=${gap.expected} received=${gap.received}`
      );
    }

    const candle1m = candleBuilder.processTick(
      tick.symbol,
      tick,
      '1m'
    );

    const candle5m = candleBuilder.processTick(
      tick.symbol,
      tick,
      '5m'
    );

    await livePersistencePipeline.persistTick(tick);

    await livePersistencePipeline.persistCandles([
      candle1m,
      candle5m,
    ]);

    recoveryEngine.saveSnapshot(
      `market:${tick.symbol}`,
      {
        tick,
        candle1m,
        candle5m,
      }
    );

    broadcastEngine.broadcastMarketTick(
      tick.symbol,
      {
        ...tick,
        candle1m,
        candle5m,
      }
    );

    return {
      tick,
      candle1m,
      candle5m,
    };
  }

  async processOrderBook(symbol, updates = []) {
    let latestBook = null;

    updates.forEach((update) => {
      latestBook = orderBookEngine.update(
        symbol,
        update.side,
        update.price,
        update.size
      );
    });

    if (latestBook) {
      await livePersistencePipeline.persistOrderBook(
        symbol,
        latestBook
      );

      recoveryEngine.saveSnapshot(
        `orderbook:${symbol}`,
        latestBook
      );

      broadcastEngine.broadcastOrderBook(
        symbol,
        latestBook
      );
    }

    return latestBook;
  }
}

module.exports = new LiveMarketPipeline();
