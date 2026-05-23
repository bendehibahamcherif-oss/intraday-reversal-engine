const historicalStore = require('./historicalStore');

class LivePersistencePipeline {
  async persistTick(tick) {
    try {
      await historicalStore.saveTick(tick);
    } catch (err) {
      console.error('Persist tick failed', err);
    }
  }

  async persistCandles(candles = []) {
    for (const candle of candles) {
      try {
        await historicalStore.saveCandle(candle);
      } catch (err) {
        console.error('Persist candle failed', err);
      }
    }
  }

  async persistOrderBook(symbol, book) {
    try {
      await historicalStore.saveOrderBook(symbol, book);
    } catch (err) {
      console.error('Persist orderbook failed', err);
    }
  }
}

module.exports = new LivePersistencePipeline();
