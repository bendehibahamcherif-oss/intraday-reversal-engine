const MODEL_POSITIONS = [
  { symbol: "AAPL", qty: 120, side: "LONG" },
  { symbol: "MSFT", qty: 80, side: "LONG" },
  { symbol: "NVDA", qty: 35, side: "LONG" },
  { symbol: "TSLA", qty: 50, side: "SHORT" },
];

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function PortfolioRiskPanel({ marketData }) {
  const rows = MODEL_POSITIONS.map((pos) => {
    const live = marketData?.[pos.symbol];
    const price = Number(live?.price || 0);
    const gross = price * pos.qty;
    const signed = pos.side === "SHORT" ? -gross : gross;
    return { ...pos, price, gross, signed, signal: live?.signal?.signal || "WAIT" };
  });

  const grossExposure = rows.reduce((a, r) => a + Math.abs(r.gross), 0);
  const netExposure = rows.reduce((a, r) => a + r.signed, 0);
  const longExposure = rows.filter((r) => r.side === "LONG").reduce((a, r) => a + r.gross, 0);
  const shortExposure = rows.filter((r) => r.side === "SHORT").reduce((a, r) => a + r.gross, 0);
  const netPct = grossExposure ? (netExposure / grossExposure) * 100 : 0;

  return (
    <section className="terminal-card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1 }}>PORTFOLIO RISK</div>
          <strong>Model book exposure</strong>
        </div>
        <strong style={{ color: Math.abs(netPct) > 60 ? "#ef4444" : "#22c55e" }}>
          Net {netPct.toFixed(0)}%
        </strong>
      </div>

      <div className="summary-grid" style={{ padding: 0, marginBottom: 12 }}>
        <div className="metric-card"><div className="metric-label">Gross</div><div className="metric-value">{money(grossExposure)}</div></div>
        <div className="metric-card"><div className="metric-label">Net</div><div className="metric-value">{money(netExposure)}</div></div>
        <div className="metric-card"><div className="metric-label">Long</div><div className="metric-value">{money(longExposure)}</div></div>
        <div className="metric-card"><div className="metric-label">Short</div><div className="metric-value">{money(shortExposure)}</div></div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ color: "#9ca3af", textAlign: "left" }}><th style={{ padding: 8 }}>Symbol</th><th>Side</th><th>Qty</th><th>Live</th><th>Exposure</th><th>Signal</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.symbol} style={{ borderTop: "1px solid #202020" }}>
                <td style={{ padding: 8, fontWeight: 700 }}>{row.symbol}</td>
                <td style={{ color: row.side === "LONG" ? "#22c55e" : "#ef4444" }}>{row.side}</td>
                <td>{row.qty}</td>
                <td>{row.price ? row.price.toFixed(2) : "—"}</td>
                <td>{money(row.gross)}</td>
                <td>{row.signal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
