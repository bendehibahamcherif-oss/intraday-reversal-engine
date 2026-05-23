export function detectRegime({
  vix,
  spxTrend,
  eurusdTrend,
}) {
  if (vix > 30 && spxTrend < 0) {
    return 'panic';
  }

  if (vix > 22) {
    return 'risk-off';
  }

  if (spxTrend > 0 && eurusdTrend > 0) {
    return 'risk-on';
  }

  return 'neutral';
}
