export default function MarketRegimePanel({ marketData }) {
  const rows = Object.values(marketData || {});

  const avgMove = rows.length
    ? rows.reduce((acc, row) => acc + Math.abs(Number(row.signal?.changePct || 0)), 0) / rows.length
    : 0;

  const avgConfidence = rows.length
    ? rows.reduce((acc, row) => acc + Number(row.signal?.confidence || 0), 0) / rows.length
    : 0;

  let regime = "Balanced";
  let color = "#22c55e";

  if (avgMove > 2.5) {
    regime = "High Volatility";
    color = "#ef4444";
  } else if (avgMove > 1.2) {
    regime = "Momentum Expansion";
    color = "#f97316";
  }

  return (
    <section className="terminal-card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1 }}>MARKET REGIME</div>
        <strong>Realtime tactical state engine</strong>
      </div>

      <div
        style={{
          background: "#050505",
          border: "1px solid #202020",
          borderRadius: 14,
          padding: 16,
        }}
      >
        <div style={{ color, fontWeight: 900, fontSize: 22 }}>{regime}</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
          <div>
            <div style={{ color: "#9ca3af", fontSize: 12 }}>Avg move</div>
            <div style={{ fontWeight: 800 }}>{avgMove.toFixed(2)}%</div>
          </div>

          <div>
            <div style={{ color: "#9ca3af", fontSize: 12 }}>AI confidence</div>
            <div style={{ fontWeight: 800 }}>{Math.round(avgConfidence * 100)}%</div>
          </div>
        </div>
      </div>
    </section>
  );
}
