import { eventBus, EVENTS } from './eventBus';
import { useMarketStore } from '../store/marketStore';
import { updateRegime } from './regimeBindings';
import { updateAnalytics } from './analyticsBindings';

eventBus.on(EVENTS.PRICE_UPDATE, (payload) => {
  useMarketStore
    .getState()
    .updatePrice(payload.symbol, payload);

  updateRegime();

  updateAnalytics(payload.symbol, payload);
});

eventBus.on(EVENTS.SIGNAL_UPDATE, (payload) => {
  useMarketStore
    .getState()
    .setSignals(payload);
});
