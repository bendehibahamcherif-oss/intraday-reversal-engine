function pct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n * 100)}%` : "—";
}

export default function ExecutiveSummary({ marketData, alerts, socketStatus }) {
  const rows = Object.values(marketData || {});
  const strongSignals = rows.filter((r) => Number(r.signal?.confidence || 0) >= 0.7).length;
  const avgConfidence = rows.length
    ? rows.reduce((a, r) => a + Number(r.signal?.confidence || 0), 0) / rows.length
    : 0;
  const activeSymbols = rows.length;

  const cards = [
    { label: "Connection", value: socketStatus.toUpperCase(), hint: "Realtime feed" },
    { label: "Active Symbols", value: activeSymbols, hint: "Live watchlist" },
    { label: "Strong Signals", value: strongSignals, hint: "Confidence ≥ 70%" },
    { label: "Avg Confidence", value: pct(avgConfidence), hint: "Signal quality" },
    { label: "AI Alerts", value: alerts.length, hint: "Ranked alerts" },
  ];

  return (
    <section className="terminal-card summary-grid">
      {cards.map((card) => (
        <div key={card.label} className="metric-card">
          <div className="metric-label">{card.label}</div>
          <div className="metric-value">{card.value}</div>
          <div className="metric-hint">{card.hint}</div>
        </div>
      ))}
    </section>
  );
}
