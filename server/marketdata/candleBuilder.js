class CandleBuilder {
  constructor() {
    this.candles = new Map();
  }

  getBucket(timestamp, timeframe = '1m') {
    const date = new Date(timestamp);

    if (timeframe === '1m') {
      date.setSeconds(0, 0);
    }

    if (timeframe === '5m') {
      const minutes = date.getMinutes();
      date.setMinutes(minutes - (minutes % 5), 0, 0);
    }

    return date.toISOString();
  }

  processTick(symbol, tick, timeframe = '1m') {
    const bucket = this.getBucket(tick.time, timeframe);

    const key = `${symbol}:${timeframe}:${bucket}`;

    const existing = this.candles.get(key);

    if (!existing) {
      this.candles.set(key, {
        symbol,
        timeframe,
        bucket,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: tick.volume || 0,
        ticks: 1,
        updatedAt: Date.now(),
      });

      return this.candles.get(key);
    }

    existing.high = Math.max(existing.high, tick.price);
    existing.low = Math.min(existing.low, tick.price);
    existing.close = tick.price;
    existing.volume += tick.volume || 0;
    existing.ticks += 1;
    existing.updatedAt = Date.now();

    return existing;
  }

  getCandles(symbol, timeframe = '1m') {
    return [...this.candles.values()].filter(
      (c) => c.symbol === symbol && c.timeframe === timeframe
    );
  }
}

module.exports = new CandleBuilder();
