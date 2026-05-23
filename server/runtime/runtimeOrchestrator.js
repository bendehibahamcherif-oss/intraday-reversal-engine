const runtimeRegistry = require('./runtimeRegistry');

class RuntimeOrchestrator {
  initialize(services = {}) {
    Object.entries(services).forEach(([key, value]) => {
      runtimeRegistry.register(key, value);
    });

    return runtimeRegistry.list();
  }

  getService(name) {
    return runtimeRegistry.get(name);
  }
}

module.exports = new RuntimeOrchestrator();
