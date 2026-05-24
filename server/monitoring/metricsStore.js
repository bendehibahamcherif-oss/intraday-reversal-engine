class MetricsStore {
  constructor() {
    this.metrics = {};
  }

  set(name, value) {
    this.metrics[name] = value;
  }

  snapshot() {
    return {
      ...this.metrics,
      collectedAt: Date.now(),
    };
  }
}

module.exports = new MetricsStore();
