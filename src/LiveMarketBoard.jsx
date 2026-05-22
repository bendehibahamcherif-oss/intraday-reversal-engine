function signalColor(signal) {
  if (signal === "FADE_UP") return "#22c55e";
  if (signal === "FADE_DOWN") return "#ef4444";
  return "#facc15";
}

function formatPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "—";
}

function formatPct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(2)}%` : "—";
}

export default function LiveMarketBoard({ marketData }) {
  const rows = Object.values(marketData || {}).sort((a, b) => a.symbol.localeCompare(b.symbol));

  return (
    <section
      style={{
        background: "#101010",
        border: "1px solid #242424",
        borderRadius: 14,
        overflow: "hidden",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid #242424",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1 }}>
            LIVE MARKET BOARD
          </div>
          <strong>Realtime watchlist & signal heatmap</strong>
        </div>
        <span style={{ color: "#9ca3af", fontSize: 12 }}>{rows.length} symbols</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "#9ca3af", textAlign: "left" }}>
              <th style={{ padding: 10 }}>Symbol</th>
              <th style={{ padding: 10 }}>Price</th>
              <th style={{ padding: 10 }}>Signal</th>
              <th style={{ padding: 10 }}>Confidence</th>
              <th style={{ padding: 10 }}>Move</th>
              <th style={{ padding: 10 }}>Extension</th>
              <th style={{ padding: 10 }}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ padding: 14, color: "#9ca3af" }}>
                  Waiting for live WebSocket data...
                </td>
              </tr>
            ) : rows.map((row) => {
              const signal = row.signal?.signal || "WAIT";
              const confidence = Math.round(Number(row.signal?.confidence || 0) * 100);
              return (
                <tr key={row.symbol} style={{ borderTop: "1px solid #202020" }}>
                  <td style={{ padding: 10, fontWeight: 700 }}>{row.symbol}</td>
                  <td style={{ padding: 10 }}>{formatPrice(row.price)}</td>
                  <td style={{ padding: 10 }}>
                    <span
                      style={{
                        color: signalColor(signal),
                        border: `1px solid ${signalColor(signal)}`,
                        borderRadius: 999,
                        padding: "3px 8px",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {signal}
                    </span>
                  </td>
                  <td style={{ padding: 10 }}>{confidence}%</td>
                  <td style={{ padding: 10, color: Number(row.signal?.changePct) >= 0 ? "#22c55e" : "#ef4444" }}>
                    {formatPct(row.signal?.changePct)}
                  </td>
                  <td style={{ padding: 10 }}>{formatPct(row.signal?.distancePct)}</td>
                  <td style={{ padding: 10, color: "#d1d5db", maxWidth: 360 }}>{row.signal?.reason || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
