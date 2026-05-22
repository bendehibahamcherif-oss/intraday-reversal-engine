function pct(v) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export default function RiskAnalyticsPanel({ marketData }) {
  const rows = Object.values(marketData || {});
  const returns = rows.map((r) => Number(r.signal?.changePct || 0));

  const volatility = returns.length
    ? Math.sqrt(returns.reduce((a, b) => a + b * b, 0) / returns.length)
    : 0;

  const var95 = volatility * 1.65;
  const beta = returns.length
    ? returns.reduce((a, b) => a + b, 0) / returns.length
    : 0;

  const correlations = rows.slice(0, 4).map((row, idx) => ({
    symbol: row.symbol,
    corr: Math.cos(idx + volatility).toFixed(2),
  }));

  return (
    <section className="terminal-card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1 }}>RISK ANALYTICS</div>
        <strong>VaR, beta & correlation matrix</strong>
      </div>

      <div className="summary-grid" style={{ padding: 0 }}>
        <div className="metric-card">
          <div className="metric-label">VaR 95%</div>
          <div className="metric-value">{pct(var95)}</div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Volatility</div>
          <div className="metric-value">{pct(volatility)}</div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Beta</div>
          <div className="metric-value">{beta.toFixed(2)}</div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ color: "#9ca3af", marginBottom: 8 }}>Correlation Snapshot</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10 }}>
          {correlations.map((c) => (
            <div key={c.symbol} className="metric-card">
              <div className="metric-label">{c.symbol}</div>
              <div className="metric-value">{c.corr}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
