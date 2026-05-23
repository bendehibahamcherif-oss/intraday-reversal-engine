export function rollingCorrelation(seriesA, seriesB) {
  const n = Math.min(seriesA.length, seriesB.length);

  if (!n) return 0;

  const avgA =
    seriesA.reduce((a, b) => a + b, 0) / n;

  const avgB =
    seriesB.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomA = 0;
  let denomB = 0;

  for (let i = 0; i < n; i++) {
    const da = seriesA[i] - avgA;
    const db = seriesB[i] - avgB;

    numerator += da * db;
    denomA += da * da;
    denomB += db * db;
  }

  return numerator /
    Math.sqrt(denomA * denomB);
}
