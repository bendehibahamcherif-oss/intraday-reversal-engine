import { SimulatedBroker } from '../brokers/SimulatedBroker';
import { IBKRPaperBroker } from '../brokers/IBKRPaperBroker';

class OMSRouter {
  constructor() {
    this.simulatedBroker = new SimulatedBroker();

    this.ibkrPaperBroker = new IBKRPaperBroker({
      gatewayUrl:
        import.meta.env.VITE_IBKR_GATEWAY || '',
      accountId:
        import.meta.env.VITE_IBKR_ACCOUNT || '',
    });

    this.activeBroker = 'SIMULATED';
  }

  setBroker(name) {
    this.activeBroker = name;
  }

  getBroker() {
    switch (this.activeBroker) {
      case 'IBKR_PAPER':
        return this.ibkrPaperBroker;

      case 'SIMULATED':
      default:
        return this.simulatedBroker;
    }
  }

  async route(order) {
    const broker = this.getBroker();

    return broker.submitOrder(order);
  }

  async cancel(orderId) {
    const broker = this.getBroker();

    return broker.cancelOrder(orderId);
  }
}

export const omsRouter = new OMSRouter();
