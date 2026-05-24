class RuntimeBrokerRegistry {
  constructor() {
    this.brokers = new Map();
  }

  register(brokerId, broker = {}) {
    this.brokers.set(brokerId, {
      brokerId,
      broker,
      connectedAt: Date.now(),
    });
  }

  get(brokerId) {
    return this.brokers.get(brokerId);
  }

  list() {
    return [...this.brokers.values()];
  }
}

module.exports = new RuntimeBrokerRegistry();
