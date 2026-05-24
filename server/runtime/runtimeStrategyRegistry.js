class RuntimeStrategyRegistry {
  constructor() {
    this.strategies = new Map();
  }

  register(strategyId, strategy = {}) {
    this.strategies.set(strategyId, {
      strategyId,
      strategy,
      updatedAt: Date.now(),
    });
  }

  get(strategyId) {
    return this.strategies.get(strategyId);
  }

  list() {
    return [...this.strategies.values()];
  }
}

module.exports = new RuntimeStrategyRegistry();
