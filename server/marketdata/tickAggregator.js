class TickAggregator {
  constructor() {
    this.buffer = [];
    this.lastSequence = 0;
  }

  normalizeTick(rawTick) {
    return {
      symbol: rawTick.symbol,
      price: Number(rawTick.price),
      volume: Number(rawTick.volume || 0),
      side: rawTick.side || 'unknown',
      sequence: rawTick.sequence || ++this.lastSequence,
      time: rawTick.time || Date.now(),
    };
  }

  process(rawTick) {
    const tick = this.normalizeTick(rawTick);

    const duplicate = this.buffer.find(
      (t) => t.sequence === tick.sequence
    );

    if (duplicate) {
      return null;
    }

    this.buffer.push(tick);

    if (this.buffer.length > 10000) {
      this.buffer.shift();
    }

    return tick;
  }

  getTicks(symbol, limit = 500) {
    return this.buffer
      .filter((t) => t.symbol === symbol)
      .slice(-limit);
  }

  validateSequence(sequence) {
    if (sequence <= this.lastSequence) {
      return false;
    }

    this.lastSequence = sequence;

    return true;
  }
}

module.exports = new TickAggregator();
