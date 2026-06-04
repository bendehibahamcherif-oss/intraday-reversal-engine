const fs = require('fs');
const path = require('path');

const PROVIDERS = {
  polygon: {
    id: 'polygon', label: 'Polygon', requiresCredentials: true, delayed: false, realtime: true, priority: 1,
    env: ['POLYGON_API_KEY', 'VITE_POLYGON_API_KEY'], capabilities: { realtime: true, delayed: false, candles: true, ticks: true, orderbook: false },
  },
  alphaVantage: {
    id: 'alphaVantage', label: 'Alpha Vantage', requiresCredentials: true, delayed: true, realtime: false, priority: 4,
    env: ['ALPHA_VANTAGE_API_KEY', 'ALPHAVANTAGE_API_KEY', 'VITE_ALPHA_VANTAGE_API_KEY'], capabilities: { realtime: false, delayed: true, candles: true, ticks: false, orderbook: false },
  },
  twelvedata: {
    id: 'twelvedata', label: 'Twelve Data', requiresCredentials: true, delayed: true, realtime: false, priority: 3,
    env: ['TWELVEDATA_API_KEY', 'TWELVE_DATA_API_KEY'], capabilities: { realtime: false, delayed: true, candles: true, ticks: false, orderbook: false },
  },
  ibkr: {
    id: 'ibkr', label: 'IBKR Gateway', requiresCredentials: true, requiresGateway: true, delayed: false, realtime: true, priority: 2,
    env: ['IBKR_API_KEY'], capabilities: { realtime: true, delayed: false, candles: true, ticks: true, orderbook: true },
  },
  yahoo: {
    id: 'yahoo', label: 'Yahoo Finance', requiresCredentials: false, delayed: true, realtime: false, priority: 5,
    env: [], capabilities: { realtime: false, delayed: true, candles: true, ticks: false, orderbook: false },
  },
  fallback_demo: {
    id: 'fallback_demo', label: 'Demo Fallback', requiresCredentials: false, delayed: true, realtime: false, priority: 99,
    env: [], capabilities: { realtime: false, delayed: true, candles: true, ticks: true, orderbook: true },
  },
};

const DEFAULT_STATE = { credentials: {}, activeProviders: ['yahoo'], providerOrder: ['yahoo'], symbols: ['SPY'] };

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((v) => normalizeProviderId(v)).filter(Boolean))];
}

function normalizeProviderId(value) {
  const raw = String(value || '').trim();
  const lower = raw.toLowerCase();
  if (!raw) return '';
  if (lower === 'alphavantage' || lower === 'alpha_vantage') return 'alphaVantage';
  if (lower === 'fallback' || lower === 'demo') return 'fallback_demo';
  if (lower === 'twelve_data') return 'twelvedata';
  return PROVIDERS[raw] ? raw : lower;
}

function maskSecret(value) {
  const secret = String(value || '');
  if (!secret) return null;
  const tail = secret.slice(-4);
  return `${'*'.repeat(Math.max(8, secret.length - 4))}${tail}`;
}

class ProviderStateService {
  constructor({ filePath } = {}) {
    this.filePath = filePath || process.env.PROVIDER_STATE_FILE || path.join(process.cwd(), 'data', 'provider-state.json');
    this.state = this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) return { ...DEFAULT_STATE, credentials: {} };
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return {
        ...DEFAULT_STATE,
        ...parsed,
        credentials: parsed?.credentials && typeof parsed.credentials === 'object' ? parsed.credentials : {},
        activeProviders: unique(parsed?.activeProviders).length ? unique(parsed.activeProviders) : DEFAULT_STATE.activeProviders,
        providerOrder: unique(parsed?.providerOrder).length ? unique(parsed.providerOrder) : unique(parsed?.activeProviders || DEFAULT_STATE.providerOrder),
      };
    } catch (error) {
      console.warn('[providers] failed to load persisted state; using defaults:', error.message);
      return { ...DEFAULT_STATE, credentials: {} };
    }
  }

  persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  assertProvider(providerId) {
    const id = normalizeProviderId(providerId);
    if (!PROVIDERS[id]) {
      const error = new Error(`Unknown provider: ${providerId}`);
      error.status = 400;
      error.code = 'unknown_provider';
      throw error;
    }
    return id;
  }

  envCredential(providerId) {
    const provider = PROVIDERS[providerId];
    for (const key of provider.env || []) {
      const value = process.env[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  }

  credentialInfo(providerId) {
    const id = this.assertProvider(providerId);
    const provider = PROVIDERS[id];
    if (!provider.requiresCredentials) return { configured: false, source: 'none', masked: null, credentialStatus: 'not_required' };
    const saved = this.state.credentials?.[id]?.apiKey;
    if (typeof saved === 'string' && saved.trim()) return { configured: true, source: 'backend', masked: maskSecret(saved.trim()), credentialStatus: 'configured' };
    const env = this.envCredential(id);
    if (env) return { configured: true, source: 'env', masked: maskSecret(env), credentialStatus: 'configured' };
    return { configured: false, source: 'none', masked: null, credentialStatus: 'missing' };
  }

  credentialsResponse() {
    const credentials = {};
    Object.keys(PROVIDERS).forEach((id) => {
      if (PROVIDERS[id].requiresCredentials) {
        const { configured, source, masked } = this.credentialInfo(id);
        credentials[id] = { configured, source, masked };
      }
    });
    return credentials;
  }

  isViable(providerId) {
    const provider = PROVIDERS[providerId];
    if (!provider) return false;
    if (!provider.requiresCredentials) return true;
    if (provider.requiresGateway && process.env.IBKR_GATEWAY_CONNECTED !== 'true') return false;
    return this.credentialInfo(providerId).configured;
  }

  providerRuntimeStatus(providerId, credentialStatus) {
    if (providerId === 'ibkr' && PROVIDERS.ibkr.requiresGateway && process.env.IBKR_GATEWAY_CONNECTED !== 'true') return 'requires_gateway';
    if (credentialStatus === 'missing') return 'missing_credentials';
    if (providerId === 'fallback_demo') return 'idle_demo';
    if (PROVIDERS[providerId].delayed) return 'delayed';
    return 'disconnected';
  }

  canonicalProvider(providerId) {
    const id = this.assertProvider(providerId);
    const provider = PROVIDERS[id];
    const credential = this.credentialInfo(id);
    const credentialStatus = provider.requiresCredentials ? credential.credentialStatus : 'not_required';
    const runtimeStatus = this.providerRuntimeStatus(id, credentialStatus);
    const activeProviders = unique(this.state.activeProviders);
    const active = activeProviders.includes(id);
    const warnings = [];
    if (runtimeStatus === 'missing_credentials') warnings.push(`${provider.label} requires API key`);
    if (runtimeStatus === 'requires_gateway') warnings.push(`${provider.label} gateway is not connected`);
    if (id === 'yahoo') warnings.push('Yahoo feed is delayed/fallback, not institutional real-time.');
    return {
      id,
      provider: id,
      source: id,
      label: provider.label,
      requiresCredentials: provider.requiresCredentials,
      credentialsStatus: credentialStatus === 'missing' ? 'missing_credentials' : credentialStatus,
      credentialStatus,
      runtimeStatus,
      status: runtimeStatus,
      selected: active,
      active,
      connected: id === 'yahoo' && active,
      realtime: provider.realtime,
      delayed: provider.delayed,
      priority: provider.priority,
      warnings,
      capabilities: provider.capabilities,
    };
  }

  allProviders() {
    return Object.keys(PROVIDERS).map((id) => this.canonicalProvider(id));
  }

  healthResponse() {
    const providers = this.allProviders();
    const activeProviders = unique(this.state.activeProviders);
    const providerOrder = unique(this.state.providerOrder).filter((id) => activeProviders.includes(id));
    return {
      success: true,
      providers,
      statuses: providers,
      activeProviders,
      providerOrder: providerOrder.length ? providerOrder : activeProviders,
      source: activeProviders[0] || 'unknown',
      connected: activeProviders.includes('yahoo'),
      warnings: [],
    };
  }

  saveCredential(providerId, apiKey) {
    const id = this.assertProvider(providerId);
    if (!PROVIDERS[id].requiresCredentials) {
      const error = new Error(`${PROVIDERS[id].label} does not require credentials`);
      error.status = 400;
      error.code = 'credentials_not_required';
      throw error;
    }
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      const error = new Error('apiKey must be a non-empty string');
      error.status = 400;
      error.code = 'invalid_api_key';
      throw error;
    }
    this.state.credentials = { ...(this.state.credentials || {}), [id]: { apiKey: apiKey.trim(), updatedAt: new Date().toISOString() } };
    // If the user just configured a provider that was already in the draft/active order, keep it. Otherwise do not silently select it.
    this.persist();
    return { success: true, provider: this.canonicalProvider(id), credentials: this.stripCredentialStatus(this.credentialInfo(id)), ...this.healthResponse() };
  }

  deleteCredential(providerId) {
    const id = this.assertProvider(providerId);
    if (this.state.credentials?.[id]) {
      const next = { ...(this.state.credentials || {}) };
      delete next[id];
      this.state.credentials = next;
    }
    if (!this.isViable(id)) {
      this.state.activeProviders = unique(this.state.activeProviders).filter((provider) => provider !== id);
      this.state.providerOrder = unique(this.state.providerOrder).filter((provider) => provider !== id);
    }
    if (this.state.activeProviders.length === 0) {
      this.state.activeProviders = ['fallback_demo'];
      this.state.providerOrder = ['fallback_demo'];
    }
    this.persist();
    return { success: true, provider: this.canonicalProvider(id), credentials: this.stripCredentialStatus(this.credentialInfo(id)), ...this.healthResponse() };
  }

  stripCredentialStatus(info) {
    return { configured: info.configured, source: info.source, masked: info.masked };
  }

  saveActiveProviders({ providers, providerOrder, symbols } = {}) {
    if (!Array.isArray(providers)) {
      const error = new Error('providers must be an array');
      error.status = 400;
      error.code = 'invalid_providers';
      throw error;
    }
    const requested = unique(providers);
    requested.forEach((id) => this.assertProvider(id));
    if (requested.length === 0) {
      const error = new Error('Select at least one provider');
      error.status = 400;
      error.code = 'empty_provider_selection';
      throw error;
    }
    for (const id of requested) {
      const provider = PROVIDERS[id];
      const credential = this.credentialInfo(id);
      if (provider.requiresCredentials && !credential.configured) {
        const error = new Error(`${provider.label} requires API key`);
        error.status = 400;
        error.code = 'missing_credentials';
        error.provider = id;
        throw error;
      }
      if (id === 'ibkr' && PROVIDERS.ibkr.requiresGateway && process.env.IBKR_GATEWAY_CONNECTED !== 'true') {
        const error = new Error(`${provider.label} gateway is not connected`);
        error.status = 400;
        error.code = 'requires_gateway';
        error.provider = id;
        throw error;
      }
    }
    const requestedOrder = unique(Array.isArray(providerOrder) ? providerOrder : providers).filter((id) => requested.includes(id));
    const finalOrder = unique([...requestedOrder, ...requested]);
    this.state.activeProviders = finalOrder;
    this.state.providerOrder = finalOrder;
    if (Array.isArray(symbols) && symbols.length) this.state.symbols = [...new Set(symbols.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))];
    this.persist();
    return this.healthResponse();
  }

  feedStatusResponse() {
    const health = this.healthResponse();
    return {
      ...health,
      feedStatus: { source: health.source, connected: health.connected, status: health.connected ? 'connected' : 'disconnected' },
      symbols: this.state.symbols || ['SPY'],
      activeSymbols: this.state.symbols || ['SPY'],
      enabledByProvider: Object.fromEntries(Object.keys(PROVIDERS).map((id) => [id, health.activeProviders.includes(id)])),
    };
  }
}

function createProviderRouter(service = new ProviderStateService()) {
  const express = require('express');
  const router = express.Router();

  function sendError(res, error) {
    res.status(error.status || 500).json({ success: false, error: error.message, code: error.code || 'provider_state_error', provider: error.provider });
  }

  router.get('/providers/credentials', (_req, res) => res.json({ success: true, credentials: service.credentialsResponse() }));
  router.post('/providers/credentials/:providerId', (req, res) => {
    try { res.json(service.saveCredential(req.params.providerId, req.body?.apiKey)); } catch (error) { sendError(res, error); }
  });
  router.post('/providers/credentials', (req, res) => {
    try { res.json(service.saveCredential(req.body?.provider, req.body?.apiKey)); } catch (error) { sendError(res, error); }
  });
  router.delete('/providers/credentials/:providerId', (req, res) => {
    try { res.json(service.deleteCredential(req.params.providerId)); } catch (error) { sendError(res, error); }
  });
  router.get('/providers/health', (_req, res) => res.json(service.healthResponse()));
  router.get('/providers/active', (_req, res) => res.json(service.healthResponse()));
  router.post('/providers/active', (req, res) => {
    try { res.json(service.saveActiveProviders(req.body || {})); } catch (error) { sendError(res, error); }
  });

  router.get('/feed/status', (_req, res) => res.json(service.feedStatusResponse()));
  router.get('/feeds/status', (_req, res) => res.json(service.feedStatusResponse()));
  router.get('/feeds/status/:source', (req, res) => {
    try { res.json({ success: true, ...service.canonicalProvider(req.params.source) }); } catch (error) { sendError(res, error); }
  });
  router.get('/feeds/providers', (_req, res) => res.json(service.healthResponse()));
  router.get('/feeds/providers/active', (_req, res) => res.json(service.healthResponse()));
  router.post('/feeds/providers/active', (req, res) => {
    try { res.json(service.saveActiveProviders({ providers: req.body?.providers, providerOrder: req.body?.providerOrder || req.body?.providers, symbols: req.body?.symbols })); } catch (error) { sendError(res, error); }
  });
  router.get('/feeds/providers/:providerId', (req, res) => {
    try { res.json({ success: true, provider: service.canonicalProvider(req.params.providerId) }); } catch (error) { sendError(res, error); }
  });
  router.post('/feeds/providers/:providerId/credentials', (req, res) => {
    try { res.json(service.saveCredential(req.params.providerId, req.body?.apiKey || req.body?.credentials?.apiKey)); } catch (error) { sendError(res, error); }
  });
  router.delete('/feeds/providers/:providerId/credentials', (req, res) => {
    try { res.json(service.deleteCredential(req.params.providerId)); } catch (error) { sendError(res, error); }
  });

  return router;
}

module.exports = { ProviderStateService, createProviderRouter, PROVIDERS, normalizeProviderId, maskSecret };
