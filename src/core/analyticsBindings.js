import { rollingCorrelation } from '../engines/correlationEngine';
import { calculateDrawdown } from '../engines/drawdownEngine';
import { calculateExposure } from '../engines/positionEngine';

import { useMarketStore } from '../store/marketStore';
import { usePortfolioStore } from '../store/portfolioStore';

const history = {
  SPX: [],
  NDX: [],
  VIX: [],
};

export function updateAnalytics(symbol, payload) {
  if (!history[symbol]) {
    history[symbol] = [];
  }

  history[symbol].push(Number(payload.price || 0));

  if (history[symbol].length > 200) {
    history[symbol].shift();
  }

  const spx = history.SPX || [];
  const ndx = history.NDX || [];

  const correlation =
    rollingCorrelation(spx, ndx);

  const drawdown =
    calculateDrawdown(spx);

  const portfolio =
    usePortfolioStore.getState();

  const exposure = calculateExposure(
    portfolio.positions
  );

  usePortfolioStore
    .getState()
    .setExposure(exposure);

  usePortfolioStore
    .getState()
    .setPnL(drawdown.maxDrawdown);

  useMarketStore.setState({
    analytics: {
      correlation,
      drawdown,
      exposure,
    },
  });
}
