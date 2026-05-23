export class OrderManager {
  constructor() {
    this.orders = new Map();
  }

  submit(order) {
    const enriched = {
      ...order,
      id: crypto.randomUUID(),
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    this.orders.set(enriched.id, enriched);

    return enriched;
  }

  updateStatus(orderId, status) {
    const order = this.orders.get(orderId);

    if (!order) {
      return null;
    }

    order.status = status;
    order.updatedAt = new Date().toISOString();

    this.orders.set(orderId, order);

    return order;
  }

  cancel(orderId) {
    return this.updateStatus(orderId, 'CANCELLED');
  }

  list() {
    return [...this.orders.values()];
  }
}

export const orderManager = new OrderManager();
