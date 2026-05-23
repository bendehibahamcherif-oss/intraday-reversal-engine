const MODEL_BOOK = [
  { symbol: "AAPL", sector: "Technology", qty: 120, avgCost: 185, side: "LONG", beta: 1.2 },
  { symbol: "MSFT", sector: "Technology", qty: 80, avgCost: 410, side: "LONG", beta: 1.0 },
  { symbol: "NVDA", sector: "Semiconductors", qty: 35, avgCost: 760, side: "LONG", beta: 1.8 },
  { symbol: "TSLA", sector: "Consumer Discretionary", qty: 50, avgCost: 220, side: "SHORT", beta: 2.0 },
];

const SCENARIOS = [
  { name: "Market -2%", shock: -0.02 },
  { name: "Market -5%", shock: -0.05 },
  { name: "Market +3%", shock: 0.03 },
  { name: "High Beta Selloff", shock: -0.08 },
];

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function StressTestPanel({ marketData }) {
  const positions = MODEL_BOOK.map((p) => {
    const price = Number(marketData?.[p.symbol]?.price || p.avgCost);
    const exposure = price * p.qty * (p.side === "SHORT" ? -1 : 1);
    return { ...p, price, exposure };
  });

  const totalGross = positions.reduce((acc, p) => acc + Math.abs(p.exposure), 0);
  const weightedBeta = totalGross
    ? positions.reduce((acc, p) => acc + Math.abs(p.exposure) * p.beta, 0) / totalGross
    : 0;

  return (
    <section className="terminal-card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1 }}>STRESS TESTING</div>
        <strong>Scenario loss engine</strong>
      </div>

      <div className="summary-grid" style={{ padding: 0 }}>
        <div className="metric-card">
          <div className="metric-label">Weighted Beta</div>
          <div className="metric-value">{weightedBeta.toFixed(2)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Gross Book</div>
          <div className="metric-value">{money(totalGross)}</div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {SCENARIOS.map((scenario) => {
          const pnl = positions.reduce((acc, p) => {
            const directional = p.side === "SHORT" ? -1 : 1;
            return acc + Math.abs(p.exposure) * scenario.shock * p.beta * directional;
          }, 0);

          return (
            <div key={scenario.name} style={{ background: "#050505", border: "1px solid #202020", borderRadius: 12, padding: 12, display: "flex", justifyContent: "space-between" }}>
              <strong>{scenario.name}</strong>
              <span style={{ color: pnl >= 0 ? "#22c55e" : "#ef4444", fontWeight: 900 }}>{money(pnl)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
