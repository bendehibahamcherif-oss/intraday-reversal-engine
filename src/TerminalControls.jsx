import { useState } from "react";

const DEFAULT_SYMBOLS = "AAPL,TSLA,NVDA,MSFT";

function cleanSymbols(value) {
  return value
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 12);
}

export default function TerminalControls({ symbols, onSymbolsChange, alertsEnabled, onAlertsToggle }) {
  const [draft, setDraft] = useState((symbols || []).join(","));

  const apply = () => {
    const next = cleanSymbols(draft || DEFAULT_SYMBOLS);
    onSymbolsChange(next.length ? next : cleanSymbols(DEFAULT_SYMBOLS));
  };

  return (
    <section
      style={{
        background: "#101010",
        border: "1px solid #242424",
        borderRadius: 14,
        padding: 14,
        marginBottom: 16,
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        gap: 10,
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1, marginBottom: 6 }}>
          TERMINAL CONTROLS
        </div>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="AAPL,TSLA,NVDA,MSFT"
          style={{
            width: "100%",
            background: "#050505",
            color: "white",
            border: "1px solid #333",
            borderRadius: 10,
            padding: "10px 12px",
            fontFamily: "monospace",
          }}
        />
      </div>

      <button
        onClick={apply}
        style={{
          background: "#2563eb",
          color: "white",
          border: 0,
          borderRadius: 10,
          padding: "10px 14px",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Apply Watchlist
      </button>

      <button
        onClick={onAlertsToggle}
        style={{
          background: alertsEnabled ? "#15803d" : "#374151",
          color: "white",
          border: 0,
          borderRadius: 10,
          padding: "10px 14px",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        AI Alerts {alertsEnabled ? "ON" : "OFF"}
      </button>
    </section>
  );
}
