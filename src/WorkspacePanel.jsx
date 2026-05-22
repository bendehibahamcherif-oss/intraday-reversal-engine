const WORKSPACES = [
  "Macro Dashboard",
  "Intraday Reversal",
  "Risk Monitor",
  "AI Scanner",
];

export default function WorkspacePanel() {
  return (
    <section className="terminal-card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1 }}>WORKSPACES</div>
        <strong>Institutional layouts</strong>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {WORKSPACES.map((w) => (
          <button
            key={w}
            style={{
              background: "#0a0a0a",
              border: "1px solid #222",
              color: "white",
              padding: 12,
              borderRadius: 12,
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            {w}
          </button>
        ))}
      </div>
    </section>
  );
}
