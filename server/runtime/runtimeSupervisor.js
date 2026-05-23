const runtimeLifecycleManager = require('./runtimeLifecycleManager');
const runtimeEventBus = require('./runtimeEventBus');

class RuntimeSupervisor {
  constructor() {
    this.state = {
      running: false,
      startedAt: null,
    };
  }

  start(services = {}) {
    const result = runtimeLifecycleManager.start(
      services
    );

    this.state.running = true;
    this.state.startedAt = Date.now();

    runtimeEventBus.emit('runtime.started', {
      ts: this.state.startedAt,
      services: result.initialized,
    });

    return result;
  }

  stop(serviceName) {
    const result = runtimeLifecycleManager.stop(
      serviceName
    );

    runtimeEventBus.emit('runtime.stopped', {
      service: serviceName,
      ts: Date.now(),
    });

    return result;
  }
}

module.exports = new RuntimeSupervisor();
