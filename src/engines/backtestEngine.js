export function runBacktest({
  candles,
  strategy,
}) {
  let pnl = 0;
  let trades = [];

  candles.forEach((candle, index) => {
    const signal = strategy(candle, index);

    if (!signal) return;

    pnl += signal.pnl || 0;

    trades.push({
      ...signal,
      timestamp: candle.timestamp,
    });
  });

  return {
    pnl,
    trades,
    tradeCount: trades.length,
  };
}
