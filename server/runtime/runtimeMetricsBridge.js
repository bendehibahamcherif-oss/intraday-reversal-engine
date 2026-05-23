const runtimeHealth = require('./runtimeHealth');
const metricsStore = require('../monitoring/metricsStore');

class RuntimeMetricsBridge {
  publish() {
    const snapshot = runtimeHealth.snapshot();

    metricsStore.metrics.runtime = {
      services: snapshot.services,
      uptime: snapshot.uptime,
      memory: snapshot.memory,
      ts: snapshot.ts,
    };

    return metricsStore.snapshot();
  }
}

module.exports = new RuntimeMetricsBridge();
