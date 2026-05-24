class RuntimePnLRegistry {
  constructor() {
    this.pnl = new Map();
  }

  update(strategyId, snapshot = {}) {
    this.pnl.set(strategyId, {
      strategyId,
      snapshot,
      updatedAt: Date.now(),
    });
  }

  get(strategyId) {
    return this.pnl.get(strategyId);
  }

  list() {
    return [...this.pnl.values()];
  }
}

module.exports = new RuntimePnLRegistry();
