class RuntimeExecutionSyncRegistry {
  constructor() {
    this.state = new Map();
  }

  syncExecution(id, payload = {}) {
    this.state.set(id, {
      id,
      payload,
      syncedAt: Date.now(),
    });
  }

  get(id) {
    return this.state.get(id);
  }

  list() {
    return [...this.state.values()];
  }
}

module.exports = new RuntimeExecutionSyncRegistry();
