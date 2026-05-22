import { useEffect, useState } from "react";
import { api } from "./api.js";

function impactColor(impact) {
  if (impact === "High") return "#ef4444";
  if (impact === "Medium") return "#f97316";
  return "#22c55e";
}

export default function MarketIntelligencePanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.intelligenceEvents()
      .then(setData)
      .catch((err) => setError(err.message || "Unable to load intelligence"));
  }, []);

  return (
    <section className="terminal-card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1 }}>MARKET INTELLIGENCE</div>
        <strong>Macro, earnings & liquidity monitor</strong>
      </div>

      {error && <div style={{ color: "#ef4444" }}>{error}</div>}

      {!data && !error && <div style={{ color: "#9ca3af" }}>Loading intelligence...</div>}

      {data && (
        <>
          <div className="metric-card" style={{ marginBottom: 12 }}>
            <div className="metric-label">Tactical Sentiment</div>
            <div className="metric-value">{data.sentiment?.label || "—"}</div>
            <div className="metric-hint">Score {Math.round(Number(data.sentiment?.score || 0) * 100)}%</div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {(data.events || []).map((event, idx) => (
              <div key={`${event.title}-${idx}`} style={{ background: "#050505", border: "1px solid #202020", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <strong>{event.title}</strong>
                  <span style={{ color: impactColor(event.impact), fontWeight: 800 }}>{event.impact}</span>
                </div>
                <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 4 }}>{event.type}</div>
                <div style={{ color: "#d1d5db", marginTop: 8 }}>{event.status}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
