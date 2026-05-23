const runtimeOrchestrator = require('./runtimeOrchestrator');
const runtimeMetricsBridge = require('./runtimeMetricsBridge');
const runtimeHealth = require('./runtimeHealth');

class RuntimeBootstrapper {
  boot(services = {}) {
    const initialized = runtimeOrchestrator.initialize(
      services
    );

    const metrics = runtimeMetricsBridge.publish();

    return {
      initialized,
      metrics,
      health: runtimeHealth.snapshot(),
    };
  }
}

module.exports = new RuntimeBootstrapper();
