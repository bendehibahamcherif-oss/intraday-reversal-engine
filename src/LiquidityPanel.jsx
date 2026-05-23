const LIQUIDITY = {
  AAPL: 0.96,
  MSFT: 0.94,
  NVDA: 0.89,
  TSLA: 0.85,
};

function status(value) {
  if (value > 0.9) return { label: "Deep", color: "#22c55e" };
  if (value > 0.75) return { label: "Tradable", color: "#f59e0b" };
  return { label: "Thin", color: "#ef4444" };
}

export default function LiquidityPanel({ marketData }) {
  const symbols = Object.keys(marketData || {});
  const rows = (symbols.length ? symbols : Object.keys(LIQUIDITY)).map((symbol) => {
    const score = LIQUIDITY[symbol] || 0.7;
    return { symbol, score, ...status(score) };
  });

  return (
    <section className="terminal-card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1 }}>LIQUIDITY MONITOR</div>
        <strong>Execution depth and liquidity quality</strong>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((row) => (
          <div key={row.symbol} style={{ display: "flex", justifyContent: "space-between", background: "#050505", border: "1px solid #202020", borderRadius: 12, padding: 12 }}>
            <div>
              <strong>{row.symbol}</strong>
              <div style={{ color: "#9ca3af", fontSize: 12 }}>Liquidity score {Math.round(row.score * 100)}</div>
            </div>
            <strong style={{ color: row.color }}>{row.label}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
