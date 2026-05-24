class RuntimeFeedRegistry {
  constructor() {
    this.feeds = new Map();
  }

  register(name, config = {}) {
    this.feeds.set(name, {
      name,
      config,
      connectedAt: Date.now(),
    });
  }

  get(name) {
    return this.feeds.get(name);
  }

  list() {
    return [...this.feeds.values()];
  }
}

module.exports = new RuntimeFeedRegistry();
