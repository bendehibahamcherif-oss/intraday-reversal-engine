import { BaseBroker } from './BaseBroker';
import { simulateExecution } from '../engines/executionEngine';

export class SimulatedBroker extends BaseBroker {
  async connect() {
    return {
      connected: true,
      broker: 'SIMULATED',
    };
  }

  async submitOrder(order) {
    return simulateExecution({
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      marketPrice: order.marketPrice,
    });
  }

  async cancelOrder(orderId) {
    return {
      orderId,
      status: 'CANCELLED',
    };
  }

  async getPositions() {
    return [];
  }
}
