class RuntimeOrderRegistry {
  constructor() {
    this.orders = new Map();
  }

  register(orderId, order = {}) {
    this.orders.set(orderId, {
      orderId,
      order,
      updatedAt: Date.now(),
    });
  }

  get(orderId) {
    return this.orders.get(orderId);
  }

  list() {
    return [...this.orders.values()];
  }
}

module.exports = new RuntimeOrderRegistry();
