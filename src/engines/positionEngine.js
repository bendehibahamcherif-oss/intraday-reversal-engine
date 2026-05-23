export function calculatePnL(
  position,
  currentPrice
) {
  const direction =
    position.side === 'SHORT'
      ? -1
      : 1;

  return (
    (currentPrice - position.avgPrice) *
    position.quantity *
    direction
  );
}

export function calculateExposure(
  positions
) {
  return positions.reduce(
    (acc, position) => {
      const value =
        position.quantity *
        position.avgPrice;

      if (position.side === 'LONG') {
        acc.long += value;
      } else {
        acc.short += value;
      }

      acc.net = acc.long - acc.short;
      acc.gross = acc.long + acc.short;

      return acc;
    },
    {
      long: 0,
      short: 0,
      gross: 0,
      net: 0,
    }
  );
}
