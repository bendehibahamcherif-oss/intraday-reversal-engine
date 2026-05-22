function colorForSignal(signal) {
  if (signal === "FADE_UP") return "#22c55e";
  if (signal === "FADE_DOWN") return "#ef4444";
  return "#facc15";
}

export default function SignalRankingPanel({ marketData }) {
  const rows = Object.values(marketData || {})
    .filter((row) => row?.signal)
    .map((row) => {
      const confidence = Number(row.signal?.confidence || 0);
      const extension = Math.abs(Number(row.signal?.distancePct || 0));
      const momentum = Math.abs(Number(row.signal?.changePct || 0));
      const score = Math.min(99, Math.round(confidence * 70 + extension * 12 + momentum * 8));
      return { ...row, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return (
    <section className="terminal-card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1 }}>SIGNAL RANKING</div>
        <strong>Multi-factor tactical scoring</strong>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {rows.length === 0 ? (
          <div style={{ color: "#9ca3af" }}>Waiting for signal data...</div>
        ) : rows.map((row) => {
          const signal = row.signal?.signal || "WAIT";
          return (
            <div
              key={row.symbol}
              style={{
                display: "grid",
                gridTemplateColumns: "70px 1fr 60px",
                alignItems: "center",
                gap: 12,
                background: "#050505",
                border: "1px solid #202020",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <strong>{row.symbol}</strong>
              <div>
                <div style={{ color: colorForSignal(signal), fontWeight: 800 }}>{signal}</div>
                <div style={{ color: "#9ca3af", fontSize: 12 }}>{row.signal?.reason || "—"}</div>
              </div>
              <strong style={{ textAlign: "right" }}>{row.score}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}
