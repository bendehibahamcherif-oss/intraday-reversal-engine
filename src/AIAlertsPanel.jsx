function badgeColor(level) {
  if (level >= 75) return "#ef4444";
  if (level >= 60) return "#f97316";
  return "#22c55e";
}

export default function AIAlertsPanel({ alerts }) {
  return (
    <section
      style={{
        background: "#101010",
        border: "1px solid #242424",
        borderRadius: 14,
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid #242424",
        }}
      >
        <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1 }}>
          AI ALERT ENGINE
        </div>
        <strong>Realtime anomaly & reversal alerts</strong>
      </div>

      <div>
        {alerts.length === 0 ? (
          <div style={{ padding: 14, color: "#9ca3af" }}>
            No alerts generated yet.
          </div>
        ) : alerts.map((alert, index) => (
          <div
            key={`${alert.symbol}-${index}`}
            style={{
              padding: 12,
              borderTop: index === 0 ? "none" : "1px solid #1f1f1f",
              display: "grid",
              gridTemplateColumns: "120px 120px 1fr auto",
              gap: 12,
              alignItems: "center",
            }}
          >
            <strong>{alert.symbol}</strong>

            <span
              style={{
                color: badgeColor(alert.score),
                fontWeight: 700,
              }}
            >
              {alert.type}
            </span>

            <span style={{ color: "#d1d5db" }}>{alert.message}</span>

            <span style={{ color: "#9ca3af", fontSize: 12 }}>
              Score {alert.score}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
