const runtimeHealth = require('../runtime/runtimeHealth');
const metricsStore = require('./metricsStore');

class RuntimeStatusAggregator {
  aggregate() {
    return {
      health: runtimeHealth.snapshot(),
      metrics: metricsStore.snapshot(),
      aggregatedAt: Date.now(),
    };
  }
}

module.exports = new RuntimeStatusAggregator();
