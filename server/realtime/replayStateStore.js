class ReplayStateStore {
  constructor() {
    this.sessions = new Map();
  }

  createSession(id, state = {}) {
    this.sessions.set(id, {
      id,
      state,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  updateSession(id, patch = {}) {
    const existing = this.sessions.get(id);

    if (!existing) {
      return null;
    }

    existing.state = {
      ...existing.state,
      ...patch,
    };

    existing.updatedAt = Date.now();

    return existing;
  }

  getSession(id) {
    return this.sessions.get(id) || null;
  }

  listSessions() {
    return [...this.sessions.values()];
  }
}

module.exports = new ReplayStateStore();
