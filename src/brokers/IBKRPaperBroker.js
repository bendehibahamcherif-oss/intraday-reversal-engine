import { BaseBroker } from './BaseBroker';

export class IBKRPaperBroker extends BaseBroker {
  constructor({ gatewayUrl, accountId }) {
    super();

    this.gatewayUrl = gatewayUrl;
    this.accountId = accountId;
    this.connected = false;
  }

  async connect() {
    this.connected = true;

    return {
      broker: 'IBKR_PAPER',
      connected: true,
      gatewayUrl: this.gatewayUrl,
      accountId: this.accountId,
    };
  }

  async submitOrder(order) {
    return {
      broker: 'IBKR_PAPER',
      orderId: crypto.randomUUID(),
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      type: order.type || 'MKT',
      status: 'SUBMITTED',
      submittedAt: new Date().toISOString(),
    };
  }

  async cancelOrder(orderId) {
    return {
      broker: 'IBKR_PAPER',
      orderId,
      status: 'CANCELLED',
    };
  }

  async getPositions() {
    return [];
  }
}
