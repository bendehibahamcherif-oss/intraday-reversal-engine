class RuntimeExecutionRegistry {
  constructor() {
    this.executions = new Map();
  }

  register(executionId, payload = {}) {
    this.executions.set(executionId, {
      executionId,
      payload,
      registeredAt: Date.now(),
    });
  }

  get(executionId) {
    return this.executions.get(executionId);
  }

  list() {
    return [...this.executions.values()];
  }
}

module.exports = new RuntimeExecutionRegistry();
