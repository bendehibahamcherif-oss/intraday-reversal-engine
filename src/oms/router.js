import { SimulatedBroker } from '../brokers/SimulatedBroker';

class OMSRouter {
  constructor() {
    this.broker = new SimulatedBroker();
  }

  async route(order) {
    return this.broker.submitOrder(order);
  }

  async cancel(orderId) {
    return this.broker.cancelOrder(orderId);
  }
}

export const omsRouter = new OMSRouter();
