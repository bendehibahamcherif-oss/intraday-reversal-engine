const runtimeRegistry = require('./runtimeRegistry');

class RuntimeHealth {
  snapshot() {
    return {
      services: runtimeRegistry.list(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      ts: Date.now(),
    };
  }
}

module.exports = new RuntimeHealth();
