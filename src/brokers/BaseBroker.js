export class BaseBroker {
  async connect() {
    throw new Error('connect not implemented');
  }

  async submitOrder(order) {
    throw new Error('submitOrder not implemented');
  }

  async cancelOrder(orderId) {
    throw new Error('cancelOrder not implemented');
  }

  async getPositions() {
    throw new Error('getPositions not implemented');
  }
}
