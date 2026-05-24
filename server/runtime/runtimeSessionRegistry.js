class RuntimeSessionRegistry {
  constructor() {
    this.sessions = new Map();
  }

  register(sessionId, payload = {}) {
    this.sessions.set(sessionId, {
      sessionId,
      payload,
      updatedAt: Date.now(),
    });
  }

  get(sessionId) {
    return this.sessions.get(sessionId);
  }

  list() {
    return [...this.sessions.values()];
  }
}

module.exports = new RuntimeSessionRegistry();
