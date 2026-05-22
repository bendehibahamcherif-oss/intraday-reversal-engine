function cellColor(value) {
  if (value > 1.2) return "#7f1d1d";
  if (value > 0.7) return "#9a3412";
  if (value > 0.3) return "#365314";
  return "#1f2937";
}

export default function VolatilityHeatmapPanel({ marketData }) {
  const rows = Object.values(marketData || {}).map((row) => {
    const move = Math.abs(Number(row.signal?.changePct || 0));
    const extension = Math.abs(Number(row.signal?.distancePct || 0));
    const heat = move + extension;
    return { symbol: row.symbol, move, extension, heat };
  }).sort((a, b) => b.heat - a.heat);

  return (
    <section className="terminal-card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1 }}>VOLATILITY HEATMAP</div>
        <strong>Move + extension intensity</strong>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
        {rows.length === 0 ? (
          <div style={{ color: "#9ca3af" }}>Waiting for heatmap data...</div>
        ) : rows.map((row) => (
          <div
            key={row.symbol}
            style={{
              background: cellColor(row.heat),
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              padding: 12,
              minHeight: 88,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 18 }}>{row.symbol}</div>
            <div style={{ color: "#e5e7eb", fontSize: 12, marginTop: 8 }}>Heat {row.heat.toFixed(2)}</div>
            <div style={{ color: "#d1d5db", fontSize: 11 }}>Move {row.move.toFixed(2)} / Ext {row.extension.toFixed(2)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
