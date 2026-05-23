import { detectRegime } from '../engines/regimeEngine';
import { useMarketStore } from '../store/marketStore';

export function updateRegime() {
  const prices = useMarketStore.getState().prices;

  const regime = detectRegime({
    vix: Number(prices.VIX?.price || 20),
    spxTrend: 1,
    eurusdTrend: 1,
  });

  useMarketStore
    .getState()
    .setRegime(regime);
}
