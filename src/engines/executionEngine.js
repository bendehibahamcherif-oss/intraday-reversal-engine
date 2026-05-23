export function simulateExecution({
  symbol,
  side,
  quantity,
  marketPrice,
}) {
  const slippageBps =
    Math.random() * 8;

  const slippage =
    marketPrice * (slippageBps / 10000);

  const fillPrice =
    side === 'BUY'
      ? marketPrice + slippage
      : marketPrice - slippage;

  return {
    id: Date.now(),
    symbol,
    side,
    quantity,
    marketPrice,
    fillPrice,
    slippage,
    timestamp: new Date().toISOString(),
    status: 'FILLED',
  };
}
