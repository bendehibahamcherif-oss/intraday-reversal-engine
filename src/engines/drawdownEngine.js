export function calculateDrawdown(equityCurve) {
  let peak = equityCurve[0] || 0;
  let maxDrawdown = 0;

  equityCurve.forEach((value) => {
    if (value > peak) {
      peak = value;
    }

    const dd = (value - peak) / peak;

    if (dd < maxDrawdown) {
      maxDrawdown = dd;
    }
  });

  return {
    maxDrawdown,
  };
}
