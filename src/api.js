// ============ API CLIENT ============
// All backend calls go through here, with auth header.

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:10000';
const TOKEN_KEY = 'reversal_user_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
export function setToken(t) {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch {}
}

function headers(extra = {}) {
  const token = getToken();
  const h = { 'Content-Type': 'application/json', ...extra };
  if (token) h['X-User-Token'] = token;
  return h;
}

async function handle(res) {
  if (res.status === 401) {
    const err = new Error('Token invalide ou manquant');
    err.status = 401; throw err;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status; throw err;
  }
  return res.json();
}

export const api = {
  base: API_BASE,

  checkAuth: async () => fetch(`${API_BASE}/auth/check`, { headers: headers() }).then(handle),

  // Alerts
  listAlerts: async (limit = 200) =>
    fetch(`${API_BASE}/alerts?limit=${limit}`, { headers: headers() }).then(handle),
  recordAlert: async (alert) =>
    fetch(`${API_BASE}/alerts`, { method: 'POST', headers: headers(), body: JSON.stringify(alert) }).then(handle),
  clearAlerts: async () =>
    fetch(`${API_BASE}/alerts`, { method: 'DELETE', headers: headers() }).then(handle),

  // Settings (cross-device sync)
  getSetting: async (key) =>
    fetch(`${API_BASE}/settings/${key}`, { headers: headers() }).then(handle),
  setSetting: async (key, value) =>
    fetch(`${API_BASE}/settings/${key}`, { method: 'PUT', headers: headers(), body: JSON.stringify({ value }) }).then(handle),

  // Backtest
  runBacktest: async (symbol, payload) =>
    fetch(`${API_BASE}/backtest/${symbol}`, { method: 'POST', headers: headers(), body: JSON.stringify(payload) }).then(handle),

  // Claude
  claudeStatus: async () => fetch(`${API_BASE}/claude/status`, { headers: headers() }).then(handle),
  claudeAnalyze: async (payload) =>
    fetch(`${API_BASE}/claude/analyze`, { method: 'POST', headers: headers(), body: JSON.stringify(payload) }).then(handle),

  // Yahoo
  yahooChart: async (symbol, interval, range) =>
    fetch(`${API_BASE}/yahoo/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`, { headers: headers() }).then(handle),
};
