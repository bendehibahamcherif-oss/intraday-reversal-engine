class RuntimePositionRegistry {
  constructor() {
    this.positions = new Map();
  }

  register(symbol, position = {}) {
    this.positions.set(symbol, {
      symbol,
      position,
      updatedAt: Date.now(),
    });
  }

  get(symbol) {
    return this.positions.get(symbol);
  }

  list() {
    return [...this.positions.values()];
  }
}

module.exports = new RuntimePositionRegistry();
