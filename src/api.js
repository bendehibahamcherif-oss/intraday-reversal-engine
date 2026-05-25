// ============ API CLIENT ============
// Centralized backend client. Supports JWT Bearer auth and legacy X-User-Token fallback.

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:10000';
const TOKEN_KEY = 'reversal_user_token';
const USER_KEY = 'reversal_user_profile';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export function setToken(t) {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch {}
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setUser(user) {
  try { if (user) localStorage.setItem(USER_KEY, JSON.stringify(user)); else localStorage.removeItem(USER_KEY); } catch {}
}

export function clearSession() {
  setToken('');
  setUser(null);
}

function headers(extra = {}) {
  const token = getToken();
  const h = { 'Content-Type': 'application/json', ...extra };

  if (token) {
    if (token.split('.').length === 3) h.Authorization = `Bearer ${token}`;
    else h['X-User-Token'] = token;
  }

  return h;
}

async function handle(res) {
  if (res.status === 401) {
    const err = new Error('Session invalide ou expirée');
    err.status = 401;
    throw err;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

async function authResult(promise) {
  const data = await promise;
  if (data.token) setToken(data.token);
  if (data.user) setUser(data.user);
  return data;
}

export const api = {
  base: API_BASE,

  login: async (email, password) => authResult(
    fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(handle)
  ),

  register: async (email, password) => authResult(
    fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(handle)
  ),

  me: async () => fetch(`${API_BASE}/auth/me`, { headers: headers() }).then(handle),
  checkAuth: async () => fetch(`${API_BASE}/auth/check`, { headers: headers() }).then(handle),
  adminUsers: async (limit = 200) => fetch(`${API_BASE}/admin/users?limit=${limit}`, { headers: headers() }).then(handle),
  intelligenceEvents: async () => fetch(`${API_BASE}/intelligence/events`).then(handle),

  listAlerts: async (limit = 200) => fetch(`${API_BASE}/alerts?limit=${limit}`, { headers: headers() }).then(handle),
  recordAlert: async (alert) => fetch(`${API_BASE}/alerts`, { method: 'POST', headers: headers(), body: JSON.stringify(alert) }).then(handle),
  clearAlerts: async () => fetch(`${API_BASE}/alerts`, { method: 'DELETE', headers: headers() }).then(handle),

  getSetting: async (key) => fetch(`${API_BASE}/settings/${key}`, { headers: headers() }).then(handle),
  setSetting: async (key, value) => fetch(`${API_BASE}/settings/${key}`, { method: 'PUT', headers: headers(), body: JSON.stringify({ value }) }).then(handle),

  yahooChart: async (symbol, interval, range) => fetch(`${API_BASE}/yahoo/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`).then(handle),

  replayStart: async ({ sessionId, symbol, options = {} }) => fetch(`${API_BASE}/api/replay/start`, { method: 'POST', headers: headers(), body: JSON.stringify({ sessionId, symbol, options }) }).then(handle),
  replayPause: async (sessionId) => fetch(`${API_BASE}/api/replay/pause`, { method: 'POST', headers: headers(), body: JSON.stringify({ sessionId }) }).then(handle),
  replayResume: async (sessionId) => fetch(`${API_BASE}/api/replay/resume`, { method: 'POST', headers: headers(), body: JSON.stringify({ sessionId }) }).then(handle),
  replayStop: async (sessionId) => fetch(`${API_BASE}/api/replay/stop`, { method: 'POST', headers: headers(), body: JSON.stringify({ sessionId }) }).then(handle),
  replayLegacyCandles: async (symbol, timeframe) => fetch(
    `${API_BASE}/api/replay-legacy/candles/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(timeframe)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),

  getAlphaSignals: async (symbol) => fetch(`${API_BASE}/api/alpha/signals/${encodeURIComponent(symbol)}`, { method: 'GET', headers: headers() }).then(handle),
  analyzeAlpha: async (symbol) => fetch(`${API_BASE}/api/alpha/analyze/${encodeURIComponent(symbol)}`, { method: 'POST', headers: headers() }).then(handle),
  getPatternSignals: async (symbol) => fetch(`${API_BASE}/api/patterns/signals/${encodeURIComponent(symbol)}`, { method: 'GET', headers: headers() }).then(handle),
  analyzePatterns: async (symbol) => fetch(`${API_BASE}/api/patterns/analyze/${encodeURIComponent(symbol)}`, { method: 'POST', headers: headers() }).then(handle),
  getStrategyCandidates: async (symbol) => fetch(`${API_BASE}/api/strategies/candidates/${encodeURIComponent(symbol)}`, { method: 'GET', headers: headers() }).then(handle),
  generateStrategies: async (symbol) => fetch(`${API_BASE}/api/strategies/generate/${encodeURIComponent(symbol)}`, { method: 'POST', headers: headers() }).then(handle),
  getQuantFeatures: async (symbol) => fetch(`${API_BASE}/api/quant/features/${encodeURIComponent(symbol)}`, { method: 'GET', headers: headers() }).then(handle),
  extractQuantFeatures: async (symbol) => fetch(`${API_BASE}/api/quant/extract/${encodeURIComponent(symbol)}`, { method: 'POST', headers: headers() }).then(handle),
  getQualityScores: async (symbol) => fetch(`${API_BASE}/api/quality/scores/${encodeURIComponent(symbol)}`, { method: 'GET', headers: headers() }).then(handle),
  scoreQuality: async (symbol) => fetch(`${API_BASE}/api/quality/score/${encodeURIComponent(symbol)}`, { method: 'POST', headers: headers() }).then(handle),

  runQuantPipeline: async (symbol, timeframe) => fetch(
    `${API_BASE}/api/quant/pipeline/${encodeURIComponent(symbol)}`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ timeframe }) }
  ).then(handle),
  getAnalysisHistory: async (symbol, limit = 20) => fetch(
    `${API_BASE}/api/quant/history/${encodeURIComponent(symbol)}?limit=${encodeURIComponent(limit)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getAnalysisSnapshot: async (id) => fetch(
    `${API_BASE}/api/quant/history/snapshot/${encodeURIComponent(id)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  clearAnalysisHistory: async (symbol) => fetch(
    `${API_BASE}/api/quant/history/${encodeURIComponent(symbol)}`,
    { method: 'DELETE', headers: headers() }
  ).then(handle),
  getAnalyticsTrend: async (symbol, limit = 20) => fetch(
    `${API_BASE}/api/analytics/trend/${encodeURIComponent(symbol)}?limit=${encodeURIComponent(limit)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getLatestAnalytics: async (symbol) => fetch(
    `${API_BASE}/api/analytics/latest/${encodeURIComponent(symbol)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  compareSnapshots: async (symbol, baseSnapshotId, compareSnapshotId) => fetch(
    `${API_BASE}/api/analytics/compare/${encodeURIComponent(symbol)}`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ baseSnapshotId, compareSnapshotId }),
    }
  ).then(handle),


  runBacktest: async (symbol, strategyId, timeframe) => fetch(
    `${API_BASE}/api/backtest/run/${encodeURIComponent(symbol)}`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ strategyId, timeframe }) }
  ).then(handle),
  getBacktestResults: async (symbol) => fetch(
    `${API_BASE}/api/backtest/results/${encodeURIComponent(symbol)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getBacktestResult: async (symbol, id) => fetch(
    `${API_BASE}/api/backtest/results/${encodeURIComponent(symbol)}/${encodeURIComponent(id)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  clearBacktestResults: async (symbol) => fetch(
    `${API_BASE}/api/backtest/results/${encodeURIComponent(symbol)}`,
    { method: 'DELETE', headers: headers() }
  ).then(handle),
  validateStrategy: async (symbol, strategyId) => fetch(
    `${API_BASE}/api/validation/strategy/${encodeURIComponent(symbol)}`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ strategyId }) }
  ).then(handle),
  getValidationResults: async (symbol) => fetch(
    `${API_BASE}/api/validation/results/${encodeURIComponent(symbol)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getValidationResult: async (symbol, id) => fetch(
    `${API_BASE}/api/validation/results/${encodeURIComponent(symbol)}/${encodeURIComponent(id)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  clearValidationResults: async (symbol) => fetch(
    `${API_BASE}/api/validation/results/${encodeURIComponent(symbol)}`,
    { method: 'DELETE', headers: headers() }
  ).then(handle),

  runtimeHealth: async () => {
    const url = `${API_BASE}/api/runtime/health`;
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}`);
      err.status = response.status;
      err.url = url;
      throw err;
    }

    const data = await response.json().catch(() => ({}));
    return { ...data, _url: url, _httpOk: response.ok };
  },
};
