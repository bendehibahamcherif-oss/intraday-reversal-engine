const MODEL_BOOK = [
  { symbol: "AAPL", sector: "Technology", qty: 120, avgCost: 185, side: "LONG" },
  { symbol: "MSFT", sector: "Technology", qty: 80, avgCost: 410, side: "LONG" },
  { symbol: "NVDA", sector: "Semiconductors", qty: 35, avgCost: 760, side: "LONG" },
  { symbol: "TSLA", sector: "Consumer Discretionary", qty: 50, avgCost: 220, side: "SHORT" },
];

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function PortfolioAnalyticsPanel({ marketData }) {
  const rows = MODEL_BOOK.map((pos) => {
    const live = marketData?.[pos.symbol];
    const price = Number(live?.price || pos.avgCost);
    const direction = pos.side === "SHORT" ? -1 : 1;
    const pnl = (price - pos.avgCost) * pos.qty * direction;
    const exposure = price * pos.qty;
    return { ...pos, price, pnl, exposure };
  });

  const totalPnl = rows.reduce((acc, row) => acc + row.pnl, 0);
  const totalExposure = rows.reduce((acc, row) => acc + Math.abs(row.exposure), 0);
  const maxConcentration = totalExposure
    ? Math.max(...rows.map((row) => Math.abs(row.exposure) / totalExposure)) * 100
    : 0;

  const sectors = rows.reduce((acc, row) => {
    acc[row.sector] = (acc[row.sector] || 0) + Math.abs(row.exposure);
    return acc;
  }, {});

  return (
    <section className="terminal-card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1 }}>PORTFOLIO ANALYTICS</div>
        <strong>PnL, concentration and sector exposure</strong>
      </div>

      <div className="summary-grid" style={{ padding: 0 }}>
        <div className="metric-card">
          <div className="metric-label">Estimated PnL</div>
          <div className="metric-value" style={{ color: totalPnl >= 0 ? "#22c55e" : "#ef4444" }}>{money(totalPnl)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Gross Exposure</div>
          <div className="metric-value">{money(totalExposure)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Max Concentration</div>
          <div className="metric-value" style={{ color: maxConcentration > 45 ? "#ef4444" : "white" }}>{maxConcentration.toFixed(0)}%</div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {Object.entries(sectors).map(([sector, exposure]) => {
          const pct = totalExposure ? (exposure / totalExposure) * 100 : 0;
          return (
            <div key={sector} style={{ background: "#050505", border: "1px solid #202020", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{sector}</strong>
                <span>{pct.toFixed(0)}%</span>
              </div>
              <div style={{ height: 8, background: "#111827", borderRadius: 999, marginTop: 8, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: pct > 50 ? "#ef4444" : "#2563eb" }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
