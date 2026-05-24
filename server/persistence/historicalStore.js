class HistoricalStore {
  constructor() {
    this.db = null;
    this.mem = {
      ticks: new Map(),
      candles: new Map(),
      orderBooks: new Map(),
    };
  }

  setDatabase(db) {
    this.db = db || null;
  }

  async persistTick(tick) {
    const key = tick.symbol;
    const list = this.mem.ticks.get(key) || [];
    list.push({ ...tick, ts: tick.time || Date.now() });
    this.mem.ticks.set(key, list.slice(-5000));

    if (this.db) {
      await this.db.collection('ticks').insertOne({ ...tick, createdAt: new Date() });
    }
  }

  async persistCandles(candles = []) {
    const valid = candles.filter(Boolean);
    valid.forEach((candle) => {
      const key = `${candle.symbol}:${candle.timeframe || '1m'}`;
      const list = this.mem.candles.get(key) || [];
      list.push(candle);
      this.mem.candles.set(key, list.slice(-5000));
    });

    if (this.db && valid.length) {
      await this.db.collection('candles').insertMany(valid.map((c) => ({ ...c, createdAt: new Date() })));
    }
  }

  async persistOrderBook(symbol, orderBook) {
    this.mem.orderBooks.set(symbol, orderBook);
    if (this.db) {
      await this.db.collection('orderbooks').insertOne({ symbol, orderBook, createdAt: new Date() });
    }
  }

  async getCandles(symbol, timeframe = '1m', limit = 500) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 5000));
    if (this.db) {
      return this.db.collection('candles')
        .find({ symbol, timeframe })
        .sort({ ts: -1 })
        .limit(safeLimit)
        .toArray();
    }

    const key = `${symbol}:${timeframe}`;
    const data = this.mem.candles.get(key) || [];
    return data.slice(-safeLimit);
  }

  async getTicks(symbol, limit = 1000) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 1000, 10000));
    if (this.db) {
      return this.db.collection('ticks')
        .find({ symbol })
        .sort({ time: -1 })
        .limit(safeLimit)
        .toArray();
    }

    const data = this.mem.ticks.get(symbol) || [];
    return data.slice(-safeLimit);
  }
}

module.exports = new HistoricalStore();
