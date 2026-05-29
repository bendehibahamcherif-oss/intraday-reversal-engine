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

const strategyLabDebugState = {
  lastStrategyLabUrl: '',
  lastStrategyLabError: '',
};

const liveDataDebugState = {
  lastFeedUrl: '',
  lastFeedMethod: '',
  lastFeedError: '',
};

function normalizeApiError(err, { url, method, status, body } = {}) {
  const next = err instanceof Error ? err : new Error(String(err || 'Request failed'));
  if (status && !next.status) next.status = status;
  if (url && !next.url) next.url = url;
  if (method && !next.method) next.method = method;
  if (body !== undefined && next.responseBody === undefined) next.responseBody = body;

  const parts = [];
  if (next.status) parts.push(`HTTP ${next.status}`);
  if (next.method) parts.push(next.method);
  if (next.url) parts.push(next.url);
  if (next.responseBody !== undefined && next.responseBody !== null && next.responseBody !== '') {
    const bodyText = typeof next.responseBody === 'string' ? next.responseBody : JSON.stringify(next.responseBody);
    parts.push(`Response: ${bodyText}`);
  }
  if (parts.length > 0) next.message = parts.join(' | ');
  return next;
}

function setLiveDataDebug(url, method, err = null) {
  liveDataDebugState.lastFeedUrl = url;
  liveDataDebugState.lastFeedMethod = method;
  liveDataDebugState.lastFeedError = err ? err.message || String(err) : '';
}

async function feedFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const method = options.method || 'GET';
  setLiveDataDebug(url, method, null);
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const body = await response.json().catch(async () => {
        const text = await response.text().catch(() => '');
        return text || null;
      });
      throw normalizeApiError(new Error('Request failed'), { url, method, status: response.status, body });
    }
    return response.json();
  } catch (err) {
    const normalized = normalizeApiError(err, { url, method });
    setLiveDataDebug(url, method, normalized);
    throw normalized;
  }
}

export function getLiveDataDebug() {
  return { ...liveDataDebugState };
}

function setStrategyLabDebug(url, err = null) {
  strategyLabDebugState.lastStrategyLabUrl = url;
  strategyLabDebugState.lastStrategyLabError = err ? (err.message || String(err)) : '';
}

async function strategyLabFetch(path, options) {
  const url = `${API_BASE}${path}`;
  setStrategyLabDebug(url, null);
  try {
    return await fetch(url, options).then(handle);
  } catch (err) {
    if (!err.url) err.url = url;
    if (err.status === 404) {
      err.message = `HTTP 404 for ${err.url}`;
    }
    setStrategyLabDebug(url, err);
    throw err;
  }
}

export function getStrategyLabDebug() {
  return { ...strategyLabDebugState };
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


  getReversalPoints: async (symbol) => fetch(
    `${API_BASE}/api/reversals/points/${encodeURIComponent(symbol)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  detectReversalPoints: async (symbol, timeframe) => fetch(
    `${API_BASE}/api/reversals/detect/${encodeURIComponent(symbol)}`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ timeframe }) }
  ).then(handle),
  clearReversalPoints: async (symbol) => fetch(
    `${API_BASE}/api/reversals/points/${encodeURIComponent(symbol)}`,
    { method: 'DELETE', headers: headers() }
  ).then(handle),

  createStrategyFromReversal: async (symbol, reversalPointId) => fetch(
    `${API_BASE}/api/reversals/strategy/${encodeURIComponent(symbol)}/${encodeURIComponent(reversalPointId)}`,
    { method: 'POST', headers: headers() }
  ).then(handle),

  saveFeatureRecord: async (symbol) => fetch(
    `${API_BASE}/api/ai/features/save/${encodeURIComponent(symbol)}`,
    { method: 'POST', headers: headers() }
  ).then(handle),
  getFeatureRecords: async (symbol, limit = 50) => fetch(
    `${API_BASE}/api/ai/features/${encodeURIComponent(symbol)}?limit=${encodeURIComponent(limit)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getFeatureRecord: async (id) => fetch(
    `${API_BASE}/api/ai/features/record/${encodeURIComponent(id)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  clearFeatureRecords: async (symbol) => fetch(
    `${API_BASE}/api/ai/features/${encodeURIComponent(symbol)}`,
    { method: 'DELETE', headers: headers() }
  ).then(handle),
  labelFeatureRecord: async (id, horizon = 10) => fetch(
    `${API_BASE}/api/ai/labels/record/${encodeURIComponent(id)}`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ horizon }) }
  ).then(handle),
  labelSymbolHistory: async (symbol, horizon = 10, limit = 50) => fetch(
    `${API_BASE}/api/ai/labels/symbol/${encodeURIComponent(symbol)}`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ horizon, limit }) }
  ).then(handle),
  getOutcomeLabels: async (symbol, limit = 50) => fetch(
    `${API_BASE}/api/ai/labels/${encodeURIComponent(symbol)}?limit=${encodeURIComponent(limit)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  clearOutcomeLabels: async (symbol) => fetch(
    `${API_BASE}/api/ai/labels/${encodeURIComponent(symbol)}`,
    { method: 'DELETE', headers: headers() }
  ).then(handle),
  saveStrategyFromReversal: async (symbol, reversalPointId) => fetch(
    `${API_BASE}/api/reversals/save-strategy/${encodeURIComponent(symbol)}/${encodeURIComponent(reversalPointId)}`,
    { method: 'POST', headers: headers() }
  ).then(handle),

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


  getCurrentRegime: async (symbol) => fetch(
    `${API_BASE}/api/ai/regime/${encodeURIComponent(symbol)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  analyzeDatasetAnalytics: async (symbol) => fetch(
    `${API_BASE}/api/ai/analytics/analyze/${encodeURIComponent(symbol)}`,
    { method: 'POST', headers: headers() }
  ).then(handle),
  getDatasetAnalytics: async (symbol) => fetch(
    `${API_BASE}/api/ai/analytics/${encodeURIComponent(symbol)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getFeatureAnalytics: async (symbol) => fetch(
    `${API_BASE}/api/ai/analytics/features/${encodeURIComponent(symbol)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getRegimeAnalytics: async (symbol) => fetch(
    `${API_BASE}/api/ai/analytics/regimes/${encodeURIComponent(symbol)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  clearDatasetAnalytics: async (symbol) => fetch(
    `${API_BASE}/api/ai/analytics/${encodeURIComponent(symbol)}`,
    { method: 'DELETE', headers: headers() }
  ).then(handle),

  getSavedStrategies: async (symbol) => strategyLabFetch(
    `/api/strategy-lab/strategies/${encodeURIComponent(symbol)}`,
    { method: 'GET', headers: headers() }
  ),
  getSavedStrategy: async (id) => strategyLabFetch(
    `/api/strategy-lab/strategy/${encodeURIComponent(id)}`,
    { method: 'GET', headers: headers() }
  ),
  saveStrategy: async (symbol, strategy) => strategyLabFetch(
    `/api/strategy-lab/save/${encodeURIComponent(symbol)}`,
    { method: 'POST', headers: headers(), body: JSON.stringify(strategy || {}) }
  ),
  updateSavedStrategy: async (id, updates) => strategyLabFetch(
    `/api/strategy-lab/strategy/${encodeURIComponent(id)}`,
    { method: 'PUT', headers: headers(), body: JSON.stringify(updates || {}) }
  ),
  deleteSavedStrategy: async (id) => strategyLabFetch(
    `/api/strategy-lab/strategy/${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: headers() }
  ),
  clearSavedStrategies: async (symbol) => strategyLabFetch(
    `/api/strategy-lab/strategies/${encodeURIComponent(symbol)}`,
    { method: 'DELETE', headers: headers() }
  ),
  compareSavedStrategies: async (symbol, strategyIds) => strategyLabFetch(
    `/api/strategy-lab/compare/${encodeURIComponent(symbol)}`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ strategyIds: strategyIds || [] }) }
  ),

  getRuleSets: async (symbol) => fetch(
    `${API_BASE}/api/rules/sets/${encodeURIComponent(symbol)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getRuleSet: async (id) => fetch(
    `${API_BASE}/api/rules/set/${encodeURIComponent(id)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  createRuleSet: async (symbol, ruleSet) => fetch(
    `${API_BASE}/api/rules/set/${encodeURIComponent(symbol)}`,
    { method: 'POST', headers: headers(), body: JSON.stringify(ruleSet || {}) }
  ).then(handle),
  updateRuleSet: async (id, updates) => fetch(
    `${API_BASE}/api/rules/set/${encodeURIComponent(id)}`,
    { method: 'PUT', headers: headers(), body: JSON.stringify(updates || {}) }
  ).then(handle),
  deleteRuleSet: async (id) => fetch(
    `${API_BASE}/api/rules/set/${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: headers() }
  ).then(handle),
  clearRuleSets: async (symbol) => fetch(
    `${API_BASE}/api/rules/sets/${encodeURIComponent(symbol)}`,
    { method: 'DELETE', headers: headers() }
  ).then(handle),
  evaluateRuleSet: async (symbol, id) => fetch(
    `${API_BASE}/api/rules/evaluate/${encodeURIComponent(symbol)}/${encodeURIComponent(id)}`,
    { method: 'POST', headers: headers() }
  ).then(handle),
  convertRuleSet: async (symbol, id) => fetch(
    `${API_BASE}/api/rules/convert/${encodeURIComponent(symbol)}/${encodeURIComponent(id)}`,
    { method: 'POST', headers: headers() }
  ).then(handle),



  getStrategyTemplates: async () => fetch(
    `${API_BASE}/api/templates/strategies`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getStrategyTemplate: async (id) => fetch(
    `${API_BASE}/api/templates/strategies/${encodeURIComponent(id)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  createRuleSetFromTemplate: async (id, symbol, overrides = {}) => fetch(
    `${API_BASE}/api/templates/strategies/${encodeURIComponent(id)}/create-rule-set`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ symbol, overrides }) }
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



  placePaperOrder: async (order) => fetch(
    `${API_BASE}/api/paper/orders`,
    { method: 'POST', headers: headers(), body: JSON.stringify(order || {}) }
  ).then(handle),
  getPaperOrders: async (symbol) => {
    const query = symbol ? `?symbol=${encodeURIComponent(symbol)}` : '';
    return fetch(`${API_BASE}/api/paper/orders${query}`, { method: 'GET', headers: headers() }).then(handle);
  },
  cancelPaperOrder: async (orderId) => fetch(
    `${API_BASE}/api/paper/orders/${encodeURIComponent(orderId)}`,
    { method: 'DELETE', headers: headers() }
  ).then(handle),
  getPaperFills: async (symbol) => {
    const query = symbol ? `?symbol=${encodeURIComponent(symbol)}` : '';
    return fetch(`${API_BASE}/api/paper/fills${query}`, { method: 'GET', headers: headers() }).then(handle);
  },
  getPaperPositions: async () => fetch(
    `${API_BASE}/api/paper/positions`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getPaperPosition: async (symbol) => fetch(
    `${API_BASE}/api/paper/positions/${encodeURIComponent(symbol)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  closePaperPosition: async (symbol) => fetch(
    `${API_BASE}/api/paper/positions/${encodeURIComponent(symbol)}/close`,
    { method: 'POST', headers: headers() }
  ).then(handle),
  enablePaperKillSwitch: async () => fetch(
    `${API_BASE}/api/paper/risk/kill-switch`,
    { method: 'POST', headers: headers() }
  ).then(handle),
  disablePaperKillSwitch: async () => fetch(
    `${API_BASE}/api/paper/risk/kill-switch`,
    { method: 'DELETE', headers: headers() }
  ).then(handle),
  getPaperRiskStatus: async () => fetch(
    `${API_BASE}/api/paper/risk/status`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  resetPaperAccount: async () => fetch(
    `${API_BASE}/api/paper/reset`,
    { method: 'POST', headers: headers() }
  ).then(handle),



  getFeedStatus: async () => feedFetch(
    `/api/feeds/status`,
    { method: 'GET', headers: headers() }
  ),
  getFeedStatusBySource: async (source) => feedFetch(
    `/api/feeds/status/${encodeURIComponent(source)}`,
    { method: 'GET', headers: headers() }
  ),
  startFeed: async (source, symbols = []) => feedFetch(
    `/api/feeds/start`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ source, symbols }) }
  ),
  stopFeed: async (source) => feedFetch(
    `/api/feeds/stop`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ source }) }
  ),
  getLatestTick: async (symbol, signal) => feedFetch(
    `/api/feeds/tick/${encodeURIComponent(symbol)}`,
    { method: 'GET', headers: headers(), ...(signal ? { signal } : {}) }
  ),
  getLatestCandle: async (symbol, timeframe, signal) => {
    const query = timeframe ? `?timeframe=${encodeURIComponent(timeframe)}` : '';
    return feedFetch(`/api/feeds/candle/${encodeURIComponent(symbol)}${query}`, { method: 'GET', headers: headers(), ...(signal ? { signal } : {}) });
  },
  getLatestOrderBook: async (symbol, signal) => feedFetch(
    `/api/feeds/orderbook/${encodeURIComponent(symbol)}`,
    { method: 'GET', headers: headers(), ...(signal ? { signal } : {}) }
  ),
  generateDemoTick: async (symbol) => feedFetch(
    `/api/feeds/demo/tick/${encodeURIComponent(symbol)}`,
    { method: 'POST', headers: headers() }
  ),
  generateDemoCandle: async (symbol) => feedFetch(
    `/api/feeds/demo/candle/${encodeURIComponent(symbol)}`,
    { method: 'POST', headers: headers() }
  ),
  generateDemoOrderBook: async (symbol) => feedFetch(
    `/api/feeds/demo/orderbook/${encodeURIComponent(symbol)}`,
    { method: 'POST', headers: headers() }
  ),
  getFeedProviders: async () => feedFetch(
    `/api/feeds/providers`,
    { method: 'GET', headers: headers() }
  ),
  getFeedProvider: async (provider) => feedFetch(
    `/api/feeds/providers/${encodeURIComponent(provider)}`,
    { method: 'GET', headers: headers() }
  ),
  saveFeedProviderCredentials: async (provider, credentials = {}) => feedFetch(
    `/api/feeds/providers/${encodeURIComponent(provider)}/credentials`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ credentials }) }
  ),

  listProviderCredentials: async () => fetch(
    `${API_BASE}/api/providers/credentials`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  saveProviderCredentials: async ({ provider, apiKey, secret, enabled }) => fetch(
    `${API_BASE}/api/providers/credentials`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ provider, apiKey, secret, enabled }),
    }
  ).then(handle),
  deleteProviderCredentials: async (provider) => fetch(
    `${API_BASE}/api/providers/credentials/${encodeURIComponent(provider)}`,
    { method: 'DELETE', headers: headers() }
  ).then(handle),

  deleteFeedProviderCredentials: async (provider) => feedFetch(
    `/api/feeds/providers/${encodeURIComponent(provider)}/credentials`,
    { method: 'DELETE', headers: headers() }
  ),
  getActiveFeedProviders: async () => feedFetch(
    `/api/feeds/providers/active`,
    { method: 'GET', headers: headers() }
  ),
  setActiveFeedProviders: async (providers = [], symbols = []) => feedFetch(
    `/api/feeds/providers/active`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ providers, symbols }) }
  ),

  getChartCandles: async (symbol, timeframe = '1m', limit = 200) => fetch(
    `${API_BASE}/api/chart/candles/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(timeframe)}&limit=${encodeURIComponent(limit)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getChartIndicators: async (symbol, timeframe = '1m', indicators = ['vwap', 'ema9', 'ema20', 'rsi14']) => {
    const indicatorQuery = Array.isArray(indicators) ? indicators.join(',') : indicators;
    return fetch(
      `${API_BASE}/api/chart/indicators/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(timeframe)}&indicators=${encodeURIComponent(indicatorQuery)}`,
      { method: 'GET', headers: headers() }
    ).then(handle);
  },
  getChartOverlays: async (symbol, timeframe = '1m') => fetch(
    `${API_BASE}/api/chart/overlays/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(timeframe)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getChartOrderflow: async (symbol) => fetch(
    `${API_BASE}/api/chart/orderflow/${encodeURIComponent(symbol)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getChartPayload: async (symbol, timeframe = '1m', limit = 200, signal) => fetch(
    `${API_BASE}/api/chart/payload/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(timeframe)}&limit=${encodeURIComponent(limit)}`,
    { method: 'GET', headers: headers(), ...(signal ? { signal } : {}) }
  ).then(handle),

  getVolumeProfile: async (symbol, signal, { mode, bins } = {}) => {
    const params = new URLSearchParams();
    if (mode) params.set('mode', mode);
    if (bins) params.set('bins', String(bins));
    const qs = params.toString();
    const url = `${API_BASE}/api/volume-profile/${encodeURIComponent(symbol)}${qs ? `?${qs}` : ''}`;
    console.log('[VP] request URL', url);
    return fetch(url, { method: 'GET', headers: headers(), ...(signal ? { signal } : {}) }).then(handle);
  },

  // Market Stream Engine — new endpoints (may return 404 on older backends; callers must try/catch)
  getMarketRuntime: async () => feedFetch('/api/market/runtime', { method: 'GET', headers: headers() }),
  getProvidersHealth: async () => feedFetch('/api/providers/health', { method: 'GET', headers: headers() }),
  getMarketSubscriptions: async () => feedFetch('/api/market/subscriptions', { method: 'GET', headers: headers() }),
  subscribeMarketSymbol: async (symbol) => feedFetch('/api/market/subscribe', { method: 'POST', headers: headers(), body: JSON.stringify({ symbol }) }),
  unsubscribeMarketSymbol: async (symbol) => feedFetch(`/api/market/subscribe/${encodeURIComponent(symbol)}`, { method: 'DELETE', headers: headers() }),

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

  // ── Alert Engine ─────────────────────────────────────────────────────────────
  getAlerts: async (symbol) => {
    const qs = symbol ? `?symbol=${encodeURIComponent(symbol)}` : '';
    return fetch(`${API_BASE}/api/alerts${qs}`, { method: 'GET', headers: headers() }).then(handle);
  },
  createAlert: async (data) =>
    fetch(`${API_BASE}/api/alerts`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handle),
  getAlertDiagnostics: async () =>
    fetch(`${API_BASE}/api/alerts/diagnostics`, { method: 'GET', headers: headers() }).then(handle),
  getAlertHistory: async ({ alertId, limit = 50 } = {}) => {
    const p = new URLSearchParams({ limit: String(limit) });
    if (alertId) p.set('alertId', alertId);
    return fetch(`${API_BASE}/api/alerts/history?${p}`, { method: 'GET', headers: headers() }).then(handle);
  },
  getAlert: async (id) =>
    fetch(`${API_BASE}/api/alerts/${encodeURIComponent(id)}`, { method: 'GET', headers: headers() }).then(handle),
  updateAlert: async (id, updates) =>
    fetch(`${API_BASE}/api/alerts/${encodeURIComponent(id)}`, { method: 'PUT', headers: headers(), body: JSON.stringify(updates) }).then(handle),
  deleteAlert: async (id) =>
    fetch(`${API_BASE}/api/alerts/${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers() }).then(handle),
  enableAlert: async (id) =>
    fetch(`${API_BASE}/api/alerts/${encodeURIComponent(id)}/enable`, { method: 'POST', headers: headers() }).then(handle),
  disableAlert: async (id) =>
    fetch(`${API_BASE}/api/alerts/${encodeURIComponent(id)}/disable`, { method: 'POST', headers: headers() }).then(handle),
};
