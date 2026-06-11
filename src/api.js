// ============ API CLIENT ============
import { stripUndefinedDeep, assertNoUndefinedDeep } from './utils/payload.js';
// Centralized backend client. Supports JWT Bearer auth and legacy X-User-Token fallback.

const RENDER_BACKEND_BASE = 'https://reversal.onrender.com';

function resolveApiBase() {
  const envBase = import.meta.env.VITE_API_BASE;
  if (envBase) return envBase.replace(/\/$/, '');
  try {
    const host = window?.location?.hostname || '';
    if (host === 'intraday-reversal-engine.onrender.com' || (host.endsWith('.onrender.com') && host !== 'reversal.onrender.com')) {
      return RENDER_BACKEND_BASE;
    }
  } catch {}
  return 'http://localhost:10000';
}

const API_BASE = resolveApiBase();
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

function endpointLabel(url) {
  try { return new URL(url).pathname; } catch { return url; }
}

const STATUS_MESSAGES = {
  400: 'Bad request',
  401: 'Session invalide ou expirée',
  403: 'Access denied',
  404: 'Endpoint not available',
  429: 'Too many requests — please wait',
  500: 'Server error',
  502: 'Backend unreachable',
  503: 'Service temporarily unavailable',
};

async function parseResponseBody(res, endpointHint = '') {
  if (res.status === 204) return null;
  const endpoint = res.url || endpointHint;
  const contentType = res.headers?.get?.('content-type') || '';
  const text = await res.text().catch(() => '');
  if (!text) {
    if (res.ok) {
      const err = new Error(`API response is not JSON (${endpointLabel(endpoint)})`);
      err.status = res.status;
      err.endpoint = endpoint;
      err.contentType = contentType;
      err.responsePreview = '';
      throw err;
    }
    const err = new Error(STATUS_MESSAGES[res.status] || `HTTP ${res.status}`);
    err.status = res.status;
    err.endpoint = endpoint;
    err.contentType = contentType;
    throw err;
  }
  if (/json/i.test(contentType)) {
    try { return JSON.parse(text); }
    catch (error) {
      if (import.meta.env.DEV) console.warn('Invalid JSON API response', { endpoint, status: res.status, preview: text.slice(0, 120) });
      const err = new Error(`API response is not JSON (${endpointLabel(endpoint)})`);
      err.status = res.status;
      err.endpoint = endpoint;
      err.contentType = contentType;
      err.responsePreview = text.slice(0, 120);
      err.cause = error;
      throw err;
    }
  }
  if (/html/i.test(contentType) || /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)) {
    const err = new Error(`API response is not JSON (${endpointLabel(endpoint)})`);
    err.status = res.status;
    err.endpoint = endpoint;
    err.contentType = contentType || 'text/html';
    err.responsePreview = text.slice(0, 120);
    throw err;
  }
  try { return JSON.parse(text); }
  catch (error) {
    if (import.meta.env.DEV) console.warn('Invalid JSON API response', { endpoint, status: res.status, preview: text.slice(0, 120) });
    const err = new Error(`API response is not JSON (${endpointLabel(endpoint)})`);
    err.status = res.status;
    err.endpoint = endpoint;
    err.contentType = contentType;
    err.responsePreview = text.slice(0, 120);
    err.cause = error;
    throw err;
  }
}

export async function apiRequest(endpoint, { method = 'GET', headers: extraHeaders, body, signal, timeoutMs = 15000 } = {}) {
  const controller = !signal && timeoutMs > 0 ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const upperMethod = String(method || 'GET').toUpperCase();
  try {
    const res = await fetch(url, {
      method: upperMethod,
      headers: headers(extraHeaders),
      body: body === undefined || typeof body === 'string' ? body : JSON.stringify(stripUndefinedDeep(body)),
      signal: signal || controller?.signal,
    });
    const data = await parseResponseBody(res, endpoint);
    const errorPayload = data?.error;
    const message = (typeof errorPayload === 'string' ? errorPayload : errorPayload?.message)
      || data?.message
      || (res.ok ? null : STATUS_MESSAGES[res.status] || `HTTP ${res.status}`);
    return { ok: res.ok, status: res.status, data, error: res.ok ? null : message, endpoint, method: upperMethod };
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    return { ok: false, status: 0, data: null, error: timedOut ? 'Request timeout' : (error?.message || 'Network error'), endpoint, method: upperMethod };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function handle(res) {
  if (res.status === 401) {
    const err = new Error('Session invalide ou expirée');
    err.status = 401;
    throw err;
  }

  const body = await parseResponseBody(res);

  if (!res.ok) {
    // body.error may be a string or an object { code, message }; extract the string in both cases.
    const rawError = body?.error;
    const message = (typeof rawError === 'string' ? rawError : rawError?.message)
      || body?.message
      || STATUS_MESSAGES[res.status]
      || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.code = typeof rawError === 'object' ? rawError?.code : undefined;
    err.endpoint = res.url;
    err.responseBody = body;
    throw err;
  }

  return body;
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
    `${API_BASE}/api/ml/features/save/${encodeURIComponent(symbol)}`,
    { method: 'POST', headers: headers() }
  ).then(handle),
  getFeatureRecords: async (symbol, limit = 50) => fetch(
    `${API_BASE}/api/ml/features/${encodeURIComponent(symbol)}?limit=${encodeURIComponent(limit)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getFeatureRecord: async (id) => fetch(
    `${API_BASE}/api/ml/features/record/${encodeURIComponent(id)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  clearFeatureRecords: async (symbol) => fetch(
    `${API_BASE}/api/ml/features/${encodeURIComponent(symbol)}`,
    { method: 'DELETE', headers: headers() }
  ).then(handle),
  labelFeatureRecord: async (id, horizon = 10) => fetch(
    `${API_BASE}/api/ml/labels/record/${encodeURIComponent(id)}`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ horizon }) }
  ).then(handle),
  labelSymbolHistory: async (symbol, horizon = 10, limit = 50) => fetch(
    `${API_BASE}/api/ml/labels/symbol/${encodeURIComponent(symbol)}`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ horizon, limit }) }
  ).then(handle),
  getOutcomeLabels: async (symbol, limit = 50) => fetch(
    `${API_BASE}/api/ml/labels/${encodeURIComponent(symbol)}?limit=${encodeURIComponent(limit)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  clearOutcomeLabels: async (symbol) => fetch(
    `${API_BASE}/api/ml/labels/${encodeURIComponent(symbol)}`,
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
    `${API_BASE}/api/ml/regime/${encodeURIComponent(symbol)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  analyzeDatasetAnalytics: async (symbol) => fetch(
    `${API_BASE}/api/ml/analytics/analyze/${encodeURIComponent(symbol)}`,
    { method: 'POST', headers: headers() }
  ).then(handle),
  getDatasetAnalytics: async (symbol) => fetch(
    `${API_BASE}/api/ml/analytics/${encodeURIComponent(symbol)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getFeatureAnalytics: async (symbol) => fetch(
    `${API_BASE}/api/ml/analytics/features/${encodeURIComponent(symbol)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getRegimeAnalytics: async (symbol) => fetch(
    `${API_BASE}/api/ml/analytics/regimes/${encodeURIComponent(symbol)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  clearDatasetAnalytics: async (symbol) => fetch(
    `${API_BASE}/api/ml/analytics/${encodeURIComponent(symbol)}`,
    { method: 'DELETE', headers: headers() }
  ).then(handle),

  // ── ML Model Engine (Phase 9) ─────────────────────────────────────────────
  trainMLModel: async (symbol, config = {}) => {
    const sym = String(symbol || 'SPY').trim().toUpperCase();
    return fetch(
      `${API_BASE}/api/ml/train`,
      { method: 'POST', headers: headers(), body: JSON.stringify(stripUndefinedDeep({ symbol: sym, ...config })) }
    ).then(handle);
  },
  getMLModelRegistry: async (symbol) => {
    const qs = symbol ? `?symbol=${encodeURIComponent(String(symbol).toUpperCase())}` : '';
    return fetch(`${API_BASE}/api/ml/model-runs${qs}`, { method: 'GET', headers: headers() }).then(handle);
  },
  getChampionModel: async (symbol) => {
    const qs = symbol ? `?symbol=${encodeURIComponent(String(symbol).toUpperCase())}` : '';
    return fetch(`${API_BASE}/api/ml/model${qs}`, { method: 'GET', headers: headers() }).then(handle);
  },
  // Promote a trained model to champion. Canonical backend route: POST /api/ml/promote/:modelId
  setChampionModel: async (modelId) => fetch(
    `${API_BASE}/api/ml/promote/${encodeURIComponent(modelId)}`,
    { method: 'POST', headers: headers() }
  ).then(handle),
  runMLInference: async (symbol, config = {}) => {
    const sym = String(symbol || 'SPY').trim().toUpperCase();
    return fetch(
      `${API_BASE}/api/ml/infer/${encodeURIComponent(sym)}`,
      { method: 'POST', headers: headers(), body: JSON.stringify(config) }
    ).then(handle);
  },
  getMLDrift: async (symbol, modelId) => {
    const p = new URLSearchParams();
    if (symbol) p.set('symbol', String(symbol).toUpperCase());
    if (modelId) p.set('modelVersion', modelId);
    const qs = p.toString() ? `?${p}` : '';
    return fetch(`${API_BASE}/api/ml/drift${qs}`, { method: 'GET', headers: headers() }).then(handle);
  },
  // Model comparison has no backend route; fail fast with a clear message instead of
  // calling a dead endpoint (avoids a misleading "Endpoint not available" 404 in the UI).
  compareMLModels: async () => {
    throw new Error('Model comparison is not available on this backend.');
  },

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

  runBacktest: async (symbol, strategyId, timeframe, datasetId) => {
    const payload = stripUndefinedDeep({
      symbol: String(symbol || 'SPY').trim().toUpperCase(),
      timeframe,
      strategyId,
      strategy: { type: strategyId || 'default_or_existing' },
      ...(datasetId ? { datasetId } : {}),
    });
    assertNoUndefinedDeep(payload);
    return fetch(
      `${API_BASE}/api/backtest/run`,
      { method: 'POST', headers: headers(), body: JSON.stringify(payload) }
    ).then(handle);
  },
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
  runWalkForwardBacktest: async (symbol, body) => fetch(
    `${API_BASE}/api/backtest/walk-forward/${encodeURIComponent(symbol)}`,
    { method: 'POST', headers: headers(), body: JSON.stringify(body) }
  ).then(handle),
  runMonteCarloBacktest: async (symbol, body) => fetch(
    `${API_BASE}/api/backtest/monte-carlo/${encodeURIComponent(symbol)}`,
    { method: 'POST', headers: headers(), body: JSON.stringify(body) }
  ).then(handle),
  getBacktestReport: async (symbol, id) => {
    const res = await fetch(
      `${API_BASE}/api/backtest/results/${encodeURIComponent(symbol)}/${encodeURIComponent(id)}/report`,
      { method: 'GET', headers: headers() }
    );
    if (res.status === 401) { const e = new Error('Session invalide ou expirée'); e.status = 401; throw e; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  },
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

  // ── Execution Engine (Phase 11) ───────────────────────────────────────────
  placeOrder: async (order, mode = 'paper') => fetch(
    `${API_BASE}/api/execution/order?mode=${encodeURIComponent(mode)}`,
    { method: 'POST', headers: headers(), body: JSON.stringify(order) }
  ).then(handle),
  getExecutionOrders: async ({ mode = 'paper', symbol, status } = {}) => {
    const p = new URLSearchParams({ mode });
    if (symbol) p.set('symbol', symbol);
    if (status) p.set('status', status);
    return fetch(`${API_BASE}/api/execution/orders?${p}`, { method: 'GET', headers: headers() }).then(handle);
  },
  cancelExecutionOrder: async (orderId, mode = 'paper') => fetch(
    `${API_BASE}/api/execution/order/${encodeURIComponent(orderId)}?mode=${encodeURIComponent(mode)}`,
    { method: 'DELETE', headers: headers() }
  ).then(handle),
  getExecutionFills: async ({ mode = 'paper', symbol } = {}) => {
    const p = new URLSearchParams({ mode });
    if (symbol) p.set('symbol', symbol);
    return fetch(`${API_BASE}/api/execution/fills?${p}`, { method: 'GET', headers: headers() }).then(handle);
  },
  preTradeRiskCheck: async (order, mode = 'paper') => fetch(
    `${API_BASE}/api/execution/risk-check?mode=${encodeURIComponent(mode)}`,
    { method: 'POST', headers: headers(), body: JSON.stringify(order) }
  ).then(handle),
  getExecutionAnalytics: async ({ mode = 'paper', symbol } = {}) => {
    const p = new URLSearchParams({ mode });
    if (symbol) p.set('symbol', symbol);
    return fetch(`${API_BASE}/api/execution/analytics?${p}`, { method: 'GET', headers: headers() }).then(handle);
  },
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
    `/api/providers/health`,
    { method: 'GET', headers: headers() }
  ),
  getFeedProvider: async (provider) => feedFetch(
    `/api/feeds/providers/${encodeURIComponent(provider)}`,
    { method: 'GET', headers: headers() }
  ),
  saveFeedProviderCredentials: async (provider, credentials = {}) => feedFetch(
    `/api/providers/credentials/${encodeURIComponent(provider)}`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ apiKey: credentials?.apiKey }) }
  ),

  listProviderCredentials: async () => fetch(
    `${API_BASE}/api/providers/credentials`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  saveProviderCredentials: async ({ provider, apiKey }) => fetch(
    `${API_BASE}/api/providers/credentials/${encodeURIComponent(provider)}`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ apiKey }),
    }
  ).then(handle),
  deleteProviderCredentials: async (provider) => fetch(
    `${API_BASE}/api/providers/credentials/${encodeURIComponent(provider)}`,
    { method: 'DELETE', headers: headers() }
  ).then(handle),

  deleteFeedProviderCredentials: async (provider) => feedFetch(
    `/api/providers/credentials/${encodeURIComponent(provider)}`,
    { method: 'DELETE', headers: headers() }
  ),
  getActiveFeedProviders: async () => feedFetch(
    `/api/providers/health`,
    { method: 'GET', headers: headers() }
  ),
  setActiveFeedProviders: async (providers = [], symbols = []) => feedFetch(
    `/api/providers/active`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ providers, providerOrder: providers, symbols }) }
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
  getChartCVD: async (symbol, { signal } = {}) => fetch(
    `${API_BASE}/api/chart/cvd/${encodeURIComponent(symbol)}`,
    { method: 'GET', headers: headers(), ...(signal ? { signal } : {}) }
  ).then(handle),
  getChartFootprint: async (symbol, { timeframe = '1m', limit = 15, clusterSize, imbalanceThreshold, signal } = {}) => {
    const p = new URLSearchParams({ timeframe, limit: String(limit) });
    if (clusterSize)          p.set('clusterSize', String(clusterSize));
    if (imbalanceThreshold)   p.set('imbalanceThreshold', String(imbalanceThreshold));
    return fetch(`${API_BASE}/api/chart/footprint/${encodeURIComponent(symbol)}?${p}`, { method: 'GET', headers: headers(), ...(signal ? { signal } : {}) }).then(handle);
  },

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

  // ── Portfolio & Risk Analytics ────────────────────────────────────────────────
  getPortfolioSummary: async (mode = 'paper') => fetch(
    `${API_BASE}/api/portfolio/summary?mode=${encodeURIComponent(mode)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getPortfolioPositions: async (mode = 'paper') => fetch(
    `${API_BASE}/api/portfolio/positions?mode=${encodeURIComponent(mode)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getPortfolioPnL: async (mode = 'paper') => fetch(
    `${API_BASE}/api/portfolio/pnl?mode=${encodeURIComponent(mode)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getPortfolioExposure: async (mode = 'paper') => fetch(
    `${API_BASE}/api/portfolio/exposure?mode=${encodeURIComponent(mode)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getPortfolioDrawdown: async (mode = 'paper') => fetch(
    `${API_BASE}/api/portfolio/drawdown?mode=${encodeURIComponent(mode)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getPortfolioVaR: async (mode = 'paper', { confidence = 0.95, method = 'historical', horizon = 1 } = {}) => fetch(
    `${API_BASE}/api/portfolio/var?mode=${encodeURIComponent(mode)}`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ confidence, method, horizon }) }
  ).then(handle),
  runPortfolioStressTest: async (mode = 'paper', { scenarios = [] } = {}) => fetch(
    `${API_BASE}/api/portfolio/stress-test?mode=${encodeURIComponent(mode)}`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ scenarios }) }
  ).then(handle),
  getPortfolioHistory: async (mode = 'paper') => fetch(
    `${API_BASE}/api/portfolio/history?mode=${encodeURIComponent(mode)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getRiskSummary: async () => fetch(`${API_BASE}/api/risk/summary`, { method: 'GET', headers: headers() }).then(handle),
  getRiskLimits: async () => fetch(`${API_BASE}/api/risk/limits`, { method: 'GET', headers: headers() }).then(handle),
  getRiskVaR: async () => fetch(`${API_BASE}/api/risk/var`, { method: 'GET', headers: headers() }).then(handle),
  getRiskDrawdown: async () => fetch(`${API_BASE}/api/risk/drawdown`, { method: 'GET', headers: headers() }).then(handle),
  getRiskExposure: async () => fetch(`${API_BASE}/api/risk/exposure`, { method: 'GET', headers: headers() }).then(handle),
  getRiskAlerts: async () => fetch(`${API_BASE}/api/risk/alerts`, { method: 'GET', headers: headers() }).then(handle),

  // ── Institutional Toolkit (Phase 14) ─────────────────────────────────────
  persistInstitutionalAnalysis: async ({ type, inputs, outputs, mode = 'paper' } = {}) => fetch(
    `${API_BASE}/api/institutional/analysis`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ type, inputs, outputs, mode }) }
  ).then(handle),
  persistInstitutionalScenarios: async ({ results, positions, mode = 'paper', accountEquity } = {}) => fetch(
    `${API_BASE}/api/institutional/scenarios`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ results, positions, mode, accountEquity }) }
  ).then(handle),
  getInstitutionalAudit: async ({ limit = 50 } = {}) => {
    const p = new URLSearchParams({ limit: String(limit) });
    return fetch(`${API_BASE}/api/institutional/audit?${p}`, { method: 'GET', headers: headers() }).then(handle);
  },

  // ── Multi-Asset Analytics (Phase 13) ─────────────────────────────────────
  getMultiAssetCorrelation: async (options = {}) => {
    const { symbols = [], window = 20, timeframe = '1d' } = options;
    const datasetId = Object.prototype.hasOwnProperty.call(options, 'datasetId') ? options.datasetId : null;
    if (datasetId === undefined) throw new Error('datasetId must not be undefined');
    const datasetIds = Array.isArray(options.datasetIds) && options.datasetIds.length ? options.datasetIds : null;
    const p = new URLSearchParams({ window: String(window), timeframe });
    if (symbols.length) p.set('symbols', symbols.join(','));
    if (datasetId) p.set('datasetId', datasetId);
    if (datasetIds) p.set('datasetIds', datasetIds.join(','));
    return fetch(`${API_BASE}/api/multi-asset/correlation?${p}`, { method: 'GET', headers: headers() }).then(handle);
  },
  getMultiAssetBeta: async (options = {}) => {
    const { symbol = options.asset || 'QQQ', benchmark = 'SPY', window = 20, timeframe = '1d', symbols = [] } = options;
    const datasetId = Object.prototype.hasOwnProperty.call(options, 'datasetId') ? options.datasetId : null;
    if (datasetId === undefined) throw new Error('datasetId must not be undefined');
    const datasetIds = Array.isArray(options.datasetIds) && options.datasetIds.length ? options.datasetIds : null;
    const p = new URLSearchParams({ symbol, asset: symbol, benchmark, window: String(window), timeframe });
    if (symbols.length) p.set('symbols', symbols.join(','));
    if (datasetId) p.set('datasetId', datasetId);
    if (datasetIds) p.set('datasetIds', datasetIds.join(','));
    return fetch(`${API_BASE}/api/multi-asset/beta?${p}`, { method: 'GET', headers: headers() }).then(handle);
  },
  getMultiAssetSectorRotation: async ({ window = 20, timeframe = '1d', symbols = [], datasetId = null } = {}) => {
    const p = new URLSearchParams({ window: String(window), timeframe });
    if (symbols.length) p.set('symbols', symbols.join(','));
    if (datasetId) p.set('datasetId', datasetId);
    return fetch(`${API_BASE}/api/multi-asset/sector-rotation?${p}`, { method: 'GET', headers: headers() }).then(handle);
  },
  getMultiAssetVolatility: async ({ symbols = [], window = 20, timeframe = '1d', datasetId = null } = {}) => {
    const p = new URLSearchParams({ window: String(window), timeframe });
    if (symbols.length) p.set('symbols', symbols.join(','));
    if (datasetId) p.set('datasetId', datasetId);
    return fetch(`${API_BASE}/api/multi-asset/volatility?${p}`, { method: 'GET', headers: headers() }).then(handle);
  },

  // ── OMS (Phase 12) ─────────────────────────────────────────────────────────
  getOMSOrders: async ({ symbol, status, limit = 100 } = {}) => {
    const p = new URLSearchParams({ limit: String(limit) });
    if (symbol) p.set('symbol', symbol);
    if (status) p.set('status', status);
    return fetch(`${API_BASE}/api/oms/orders?${p}`, { method: 'GET', headers: headers() }).then(handle);
  },
  getOMSOrder: async (orderId) => fetch(
    `${API_BASE}/api/oms/orders/${encodeURIComponent(orderId)}`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getOMSOrderEvents: async (orderId) => fetch(
    `${API_BASE}/api/oms/orders/${encodeURIComponent(orderId)}/events`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  runOMSReconciliation: async () => fetch(
    `${API_BASE}/api/oms/reconciliation`,
    { method: 'POST', headers: headers() }
  ).then(handle),
  getOMSReconciliation: async () => fetch(
    `${API_BASE}/api/oms/reconciliation`,
    { method: 'GET', headers: headers() }
  ).then(handle),
  getOMSStats: async () => fetch(
    `${API_BASE}/api/oms/stats`,
    { method: 'GET', headers: headers() }
  ).then(handle),

  // ── Ops / Observability (Phase 15) ───────────────────────────────────────
  getOpsStatus: async () => fetch(
    `${API_BASE}/api/ops/status`,
    { method: 'GET', headers: headers() }
  ).then(handle),

  // ── ML Signal Engine P1 (Phase 9A) ───────────────────────────────────────
  getMLFeatures: async (symbol, timeframe = '1m', limit = 1) => {
    const p = new URLSearchParams({ timeframe, limit: String(limit) });
    return fetch(`${API_BASE}/api/ml/features/${encodeURIComponent(symbol)}?${p}`, { method: 'GET', headers: headers() }).then(handle);
  },
  getMLSignal: async (symbol, timeframe = '1m', preview = false) => {
    const p = new URLSearchParams({ timeframe });
    if (preview) p.set('preview', '1');
    return fetch(`${API_BASE}/api/ml/signal/${encodeURIComponent(symbol)}?${p}`, { method: 'GET', headers: headers() }).then(handle);
  },
  getMLModels: async (symbol) => {
    const p = symbol ? `?symbol=${encodeURIComponent(symbol)}` : '';
    return fetch(`${API_BASE}/api/ml/models${p}`, { method: 'GET', headers: headers() }).then(handle);
  },
  trainMLModelP1: async ({ symbol, timeframe = '1m', candles = [], xgbConfig = {}, datasetId, horizon = 20, datasetPath, promote = false } = {}) =>
    fetch(`${API_BASE}/api/ml/train`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify(stripUndefinedDeep({ symbol, timeframe, candles, xgbConfig, horizon, datasetPath, promote, ...(datasetId ? { datasetId } : {}) })),
    }).then(handle),
  promoteMLModel: async (modelVersion) =>
    fetch(`${API_BASE}/api/ml/promote/${encodeURIComponent(modelVersion)}`, { method: 'POST', headers: headers() }).then(handle),
  getMLMetrics: async () =>
    fetch(`${API_BASE}/api/ml/metrics`, { method: 'GET', headers: headers() }).then(handle),
  getMLWorkerStatus: async () =>
    fetch(`${API_BASE}/api/ml/worker/status`, { method: 'GET', headers: headers() }).then(handle),

  // ── ML Engine Phase 9B ────────────────────────────────────────────────────
  getMLHealth: async () =>
    fetch(`${API_BASE}/api/ml/health`, { method: 'GET', headers: headers() }).then(handle),

  getMLModelInfo: async () =>
    fetch(`${API_BASE}/api/ml/model`, { method: 'GET', headers: headers() }).then(handle),

  mlInfer: async (symbol, body) => {
    const sym = String(symbol || 'SPY').trim().toUpperCase();
    return fetch(`${API_BASE}/api/ml/infer/${encodeURIComponent(sym)}`, {
      method: 'POST', headers: headers(), body: JSON.stringify(body || {}),
    }).then(handle);
  },

  getMLModelRuns: async (symbol) => {
    const qs = symbol ? `?symbol=${encodeURIComponent(String(symbol).toUpperCase())}` : '';
    return fetch(`${API_BASE}/api/ml/model-runs${qs}`, { method: 'GET', headers: headers() }).then(handle);
  },

  getMLPredictions: async ({ limit = 100, symbol } = {}) => {
    const p = new URLSearchParams({ limit: String(limit) });
    if (symbol) p.set('symbol', symbol);
    return fetch(`${API_BASE}/api/ml/predictions?${p}`, { method: 'GET', headers: headers() }).then(handle);
  },

  getMLFeatureImportance: async (modelVersion) => {
    const p = modelVersion ? `?modelVersion=${encodeURIComponent(modelVersion)}` : '';
    return fetch(`${API_BASE}/api/ml/feature-importance${p}`, { method: 'GET', headers: headers() }).then(handle);
  },

  getMLDriftMetrics: async () =>
    fetch(`${API_BASE}/api/ml/drift`, { method: 'GET', headers: headers() }).then(handle),

  getMLModelCard: async () =>
    fetch(`${API_BASE}/api/ml/model-card`, { method: 'GET', headers: headers() }).then(handle),

  // ── Historical Data Download Center ──────────────────────────────────────
  getHistoricalProviders: async () =>
    fetch(`${API_BASE}/api/historical/providers`, { method: 'GET', headers: headers() }).then(handle),

  getHistoricalDatasets: async () =>
    fetch(`${API_BASE}/api/historical/datasets`, { method: 'GET', headers: headers() }).then(handle),

  getHistoricalDataset: async (datasetId) => {
    if (!datasetId) throw new Error('datasetId is required');
    return fetch(`${API_BASE}/api/historical/datasets/${encodeURIComponent(datasetId)}`, { method: 'GET', headers: headers() }).then(handle);
  },

  deleteHistoricalDataset: async (datasetId) =>
    fetch(`${API_BASE}/api/historical/datasets/${encodeURIComponent(datasetId)}`, { method: 'DELETE', headers: headers() }).then(handle),

  downloadHistoricalData: async (params) => {
    const payload = stripUndefinedDeep(params || {});
    assertNoUndefinedDeep(payload);
    if (!Array.isArray(payload.symbols)) throw new Error('symbols must be an array');
    return fetch(`${API_BASE}/api/historical/download`, {
      method: 'POST', headers: headers(), body: JSON.stringify(payload),
    }).then(handle);
  },

  getHistoricalDatasetDiagnostics: async (datasetId) =>
    fetch(`${API_BASE}/api/historical/datasets/${encodeURIComponent(datasetId)}/diagnostics`, { method: 'GET', headers: headers() }).then(handle),

  useHistoricalDatasetForMl: async (datasetId) => {
    if (!datasetId) throw new Error('datasetId is required');
    return fetch(`${API_BASE}/api/historical/use-for-ml`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ datasetId }),
    }).then(handle);
  },

  useHistoricalDatasetForBacktest: async (datasetId) => {
    if (!datasetId) throw new Error('datasetId is required');
    return fetch(`${API_BASE}/api/historical/use-for-backtest`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ datasetId }),
    }).then(handle);
  },

  useHistoricalDatasetForCorrelation: async (datasetId) => {
    if (!datasetId) throw new Error('datasetId is required');
    return fetch(`${API_BASE}/api/historical/use-for-correlation`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ datasetId }),
    }).then(handle);
  },
};
