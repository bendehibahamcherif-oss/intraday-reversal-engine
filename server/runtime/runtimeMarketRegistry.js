class RuntimeMarketRegistry {
  constructor() {
    this.markets = new Map();
  }

  register(symbol, market = {}) {
    this.markets.set(symbol, {
      symbol,
      market,
      updatedAt: Date.now(),
    });
  }

  get(symbol) {
    return this.markets.get(symbol);
  }

  list() {
    return [...this.markets.values()];
  }
}

module.exports = new RuntimeMarketRegistry();
