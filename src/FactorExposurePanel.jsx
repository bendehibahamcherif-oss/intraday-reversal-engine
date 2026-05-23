const FACTORS = {
  AAPL: { growth: 0.82, momentum: 0.64, quality: 0.74, beta: 1.2 },
  MSFT: { growth: 0.76, momentum: 0.52, quality: 0.86, beta: 1.0 },
  NVDA: { growth: 0.94, momentum: 0.88, quality: 0.62, beta: 1.8 },
  TSLA: { growth: 0.71, momentum: 0.77, quality: 0.38, beta: 2.0 },
};

function barColor(value) {
  if (value > 0.75) return "#ef4444";
  if (value > 0.55) return "#f97316";
  return "#22c55e";
}

export default function FactorExposurePanel({ marketData }) {
  const symbols = Object.keys(marketData || {});
  const universe = symbols.length ? symbols : Object.keys(FACTORS);

  const avg = universe.reduce((acc, symbol) => {
    const f = FACTORS[symbol] || { growth: 0.5, momentum: 0.5, quality: 0.5, beta: 1 };
    acc.growth += f.growth;
    acc.momentum += f.momentum;
    acc.quality += f.quality;
    acc.beta += f.beta;
    return acc;
  }, { growth: 0, momentum: 0, quality: 0, beta: 0 });

  const n = Math.max(universe.length, 1);
  const factors = [
    { label: "Growth", value: avg.growth / n },
    { label: "Momentum", value: avg.momentum / n },
    { label: "Quality", value: avg.quality / n },
    { label: "Beta", value: Math.min((avg.beta / n) / 2, 1) },
  ];

  return (
    <section className="terminal-card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1 }}>FACTOR EXPOSURE</div>
        <strong>Style factor decomposition</strong>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {factors.map((factor) => (
          <div key={factor.label}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: "#d1d5db" }}>{factor.label}</span>
              <strong>{Math.round(factor.value * 100)}%</strong>
            </div>
            <div style={{ height: 9, background: "#111827", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${Math.round(factor.value * 100)}%`, height: "100%", background: barColor(factor.value) }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
