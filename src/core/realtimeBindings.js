import { eventBus, EVENTS } from './eventBus';
import { useMarketStore } from '../store/marketStore';

eventBus.on(EVENTS.PRICE_UPDATE, (payload) => {
  useMarketStore
    .getState()
    .updatePrice(payload.symbol, payload.price);
});

eventBus.on(EVENTS.SIGNAL_UPDATE, (payload) => {
  useMarketStore
    .getState()
    .setSignals(payload);
});
