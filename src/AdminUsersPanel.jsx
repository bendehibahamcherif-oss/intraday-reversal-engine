import { useEffect, useState } from "react";
import { api } from "./api.js";

export default function AdminUsersPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const data = await api.adminUsers();
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message || "Unable to load users");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="terminal-card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ color: "#9ca3af", fontSize: 12 }}>ADMIN</div>
          <h2 style={{ margin: 0 }}>Users</h2>
        </div>

        <button onClick={load} style={buttonStyle}>Refresh</button>
      </div>

      {loading && <div>Loading users...</div>}
      {error && <div style={{ color: "#ef4444" }}>{error}</div>}

      {!loading && !error && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #222" }}>
                <th style={th}>ID</th>
                <th style={th}>Email</th>
                <th style={th}>Role</th>
                <th style={th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid #111" }}>
                  <td style={td}>{u.id}</td>
                  <td style={td}>{u.email}</td>
                  <td style={td}>{u.role}</td>
                  <td style={td}>{new Date(u.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th = {
  padding: "10px 8px",
  color: "#9ca3af",
  fontSize: 12,
};

const td = {
  padding: "12px 8px",
  fontSize: 14,
};

const buttonStyle = {
  background: "#2563eb",
  border: 0,
  borderRadius: 8,
  color: "white",
  cursor: "pointer",
  padding: "8px 14px",
  fontWeight: 700,
};
