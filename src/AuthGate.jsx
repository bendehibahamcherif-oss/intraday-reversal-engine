import { useState } from "react";
import { api } from "./api.js";

export default function AuthGate({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = mode === "login"
        ? await api.login(email, password)
        : await api.register(email, password);

      onAuth(result.user);
    } catch (err) {
      setError(err.message || "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="terminal-shell" style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 20 }}>
      <form onSubmit={submit} className="terminal-card" style={{ width: "100%", maxWidth: 440, padding: 24 }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12, color: "#9ca3af", letterSpacing: 1 }}>REVERSAL INSTITUTIONAL TERMINAL</div>
          <h1 style={{ margin: "8px 0 0", fontSize: 26 }}>{mode === "login" ? "Login" : "Create account"}</h1>
        </div>

        <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <span style={{ color: "#9ca3af", fontSize: 13 }}>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required style={inputStyle} />
        </label>

        <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <span style={{ color: "#9ca3af", fontSize: 13 }}>Password</span>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={8} style={inputStyle} />
        </label>

        {error && <div style={{ color: "#ef4444", marginBottom: 12 }}>{error}</div>}

        <button disabled={loading} style={buttonStyle}>
          {loading ? "Please wait..." : mode === "login" ? "Login" : "Register"}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          style={{ ...buttonStyle, background: "transparent", border: "1px solid #333", marginTop: 10 }}
        >
          {mode === "login" ? "Create new account" : "Back to login"}
        </button>
      </form>
    </div>
  );
}

const inputStyle = {
  background: "#050505",
  border: "1px solid #333",
  borderRadius: 10,
  color: "white",
  padding: "12px 14px",
};

const buttonStyle = {
  width: "100%",
  background: "#2563eb",
  border: 0,
  borderRadius: 10,
  color: "white",
  cursor: "pointer",
  fontWeight: 800,
  padding: "12px 14px",
};
