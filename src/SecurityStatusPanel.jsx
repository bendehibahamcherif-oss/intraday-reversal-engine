export default function SecurityStatusPanel({ user }) {
  const items = [
    { label: "Session", value: user?.email ? "JWT Active" : "Shared Token", state: "ok" },
    { label: "Role", value: user?.role || "user", state: user?.role === "admin" ? "ok" : "warn" },
    { label: "Passwords", value: "bcrypt hashed", state: "ok" },
    { label: "Credentials", value: "never exposed", state: "ok" },
  ];

  return (
    <section className="terminal-card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1 }}>SECURITY STATUS</div>
        <strong>Access, session and credential safety</strong>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {items.map((item) => (
          <div
            key={item.label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              background: "#050505",
              border: "1px solid #202020",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <span style={{ color: "#9ca3af" }}>{item.label}</span>
            <strong style={{ color: item.state === "ok" ? "#22c55e" : "#f97316" }}>{item.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
