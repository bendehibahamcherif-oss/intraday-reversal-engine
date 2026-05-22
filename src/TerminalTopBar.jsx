import { clearSession } from "./api.js";

export default function TerminalTopBar({ user, onLogout }) {
  function logout() {
    clearSession();
    onLogout();
  }

  return (
    <div
      style={{
        padding: "10px 18px",
        borderBottom: "1px solid #1f1f1f",
        background: "#080808",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div>
        <strong>REVERSAL INSTITUTIONAL</strong>
        <span style={{ color: "#9ca3af", marginLeft: 10, fontSize: 12 }}>
          Quant Terminal / Live Risk / AI Signals
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ color: "#9ca3af", fontSize: 13 }}>
          {user?.email || "shared-token"} · {user?.role || "user"}
        </span>
        <button
          onClick={logout}
          style={{
            background: "#1f2937",
            color: "white",
            border: "1px solid #374151",
            borderRadius: 8,
            padding: "7px 10px",
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>
    </div>
  );
}
