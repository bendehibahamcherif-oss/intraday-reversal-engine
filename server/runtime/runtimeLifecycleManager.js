const runtimeBootstrapper = require('./runtimeBootstrapper');
const runtimeRegistry = require('./runtimeRegistry');

class RuntimeLifecycleManager {
  start(services = {}) {
    return runtimeBootstrapper.boot(services);
  }

  stop(serviceName) {
    const service = runtimeRegistry.get(serviceName);

    if (
      service &&
      typeof service.shutdown === 'function'
    ) {
      service.shutdown();
    }

    return {
      stopped: serviceName,
      ts: Date.now(),
    };
  }
}

module.exports = new RuntimeLifecycleManager();
