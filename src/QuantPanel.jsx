export default function QuantPanel({ marketData }) {
  const rows = Object.values(marketData || {});

  const avgConfidence = rows.length
    ? rows.reduce((a, b) => a + Number(b.signal?.confidence || 0), 0) / rows.length
    : 0;

  const avgMove = rows.length
    ? rows.reduce((a, b) => a + Math.abs(Number(b.signal?.changePct || 0)), 0) / rows.length
    : 0;

  let regime = "NORMAL";
  if (avgMove > 1.2) regime = "HIGH VOL";
  else if (avgMove < 0.3) regime = "LOW VOL";

  return (
    <section style={{ background: "#101010", border: "1px solid #242424", borderRadius: 14, padding: 14, marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1 }}>QUANT ENGINE</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 12 }}>
        <div style={{ background: "#050505", borderRadius: 12, padding: 12 }}>
          <div style={{ color: "#9ca3af", fontSize: 12 }}>Market Regime</div>
          <strong style={{ fontSize: 22 }}>{regime}</strong>
        </div>

        <div style={{ background: "#050505", borderRadius: 12, padding: 12 }}>
          <div style={{ color: "#9ca3af", fontSize: 12 }}>Avg Confidence</div>
          <strong style={{ fontSize: 22 }}>{Math.round(avgConfidence * 100)}%</strong>
        </div>

        <div style={{ background: "#050505", borderRadius: 12, padding: 12 }}>
          <div style={{ color: "#9ca3af", fontSize: 12 }}>Volatility Score</div>
          <strong style={{ fontSize: 22 }}>{avgMove.toFixed(2)}</strong>
        </div>
      </div>
    </section>
  );
}
