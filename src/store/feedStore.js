import { create } from 'zustand';
import { api, getLiveDataDebug } from '../api.js';

const initialState = {
  symbol: 'SPY',
  timeframe: '1m',
  feedStatus: null,
  latestTick: null,
  latestCandle: null,
  latestOrderBook: null,
  loading: false,
  error: '',
  lastUpdated: null,
  providers: [],
  activeProviders: [],
  providerCredentialsStatus: {},
  selectedProviders: [],
  credentialsDraft: {},
  credentialsLoading: false,
  credentialsError: '',
  lastFeedUrl: '',
  lastFeedMethod: '',
  lastFeedError: '',
  apiBase: import.meta.env.VITE_API_BASE || 'http://localhost:10000',
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pickProviderName(record = {}) {
  return String(record?.provider || record?.source || record?.id || record?.name || '').trim();
}

function normalizeFeedStatusPayload(payload, activeProviders = [], providers = []) {
  const providerMeta = [...asArray(payload?.providers), ...asArray(providers)];
  const statuses = [];

  const pushStatus = (entry = {}) => {
    const source = pickProviderName(entry);
    if (!source) return;
    const warnings = asArray(entry?.warnings);
    const symbols = asArray(entry?.symbols || entry?.activeSymbols);
    const connected = entry?.connected === true;
    const status = String(
      entry?.status
      || entry?.state
      || (source === 'fallback_demo' ? 'idle_demo' : (connected ? 'connected' : 'disconnected'))
    );

    const nextWarnings = [...warnings];
    if (source === 'yahoo' && !nextWarnings.some((w) => String(w).toLowerCase().includes('delayed'))) {
      nextWarnings.push('Yahoo feed is delayed/fallback, not institutional real-time.');
    }

    statuses.push({
      source,
      status,
      connected,
      symbols,
      warnings: nextWarnings,
      lastMessageAt: entry?.lastMessageAt || entry?.updatedAt || null,
      latencyMs: entry?.latencyMs,
      mode: entry?.mode,
      live: entry?.live,
    });
  };

  const topLevel = payload?.status || payload?.feedStatus || payload;
  if (topLevel && typeof topLevel === 'object' && !Array.isArray(topLevel)) pushStatus(topLevel);
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const source = pickProviderName(payload);
    if (source) {
      pushStatus({
        ...payload,
        source,
        status: typeof topLevel === 'string' ? topLevel : (payload?.state || payload?.status),
      });
    }
  }
  asArray(payload?.statuses).forEach(pushStatus);
  providerMeta.forEach((provider) => {
    const providerName = pickProviderName(provider);
    if (!providerName) return;
    pushStatus({
      source: providerName,
      status: provider?.status || provider?.connectionStatus,
      connected: provider?.connected,
      symbols: provider?.symbols || provider?.activeSymbols,
      warnings: provider?.warnings,
      lastMessageAt: provider?.lastMessageAt,
      latencyMs: provider?.latencyMs,
    });
  });

  const deduped = [];
  const bySource = new Map();
  statuses.forEach((item) => {
    const previous = bySource.get(item.source);
    if (!previous) {
      bySource.set(item.source, item);
      return;
    }
    bySource.set(item.source, {
      ...previous,
      ...item,
      symbols: item.symbols?.length ? item.symbols : previous.symbols,
      warnings: [...new Set([...(previous.warnings || []), ...(item.warnings || [])])],
      connected: previous.connected || item.connected,
    });
  });
  bySource.forEach((value) => deduped.push(value));

  const active = asArray(payload?.activeProviders).length ? asArray(payload?.activeProviders) : asArray(activeProviders);
  const activeSet = new Set(active.map((name) => String(name)));
  deduped.forEach((item) => {
    if (activeSet.size === 0) item.active = true;
    else item.active = activeSet.has(item.source);
  });

  const activeStatuses = deduped.filter((item) => item.active);
  const primary = activeStatuses[0] || deduped[0] || null;
  return {
    ...payload,
    activeProviders: active,
    providers: providerMeta,
    statuses: deduped,
    activeStatuses,
    source: primary?.source || payload?.source || 'unknown',
    status: primary?.status || payload?.status || 'unknown',
    connected: primary?.connected === true,
    symbols: primary?.symbols || [],
    warnings: primary?.warnings || [],
    lastMessageAt: primary?.lastMessageAt || null,
    latencyMs: primary?.latencyMs,
  };
}

function normalizeError(error) {
  const status = error?.status ? `HTTP ${error.status}` : '';
  const method = error?.method || '';
  const url = error?.url || '';
  const responseBody = error?.responseBody;
  const responseText = responseBody === undefined || responseBody === null || responseBody === ''
    ? ''
    : (typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody));
  const parts = [status, method, url, responseText ? `Response: ${responseText}` : ''].filter(Boolean);
  return parts.length ? parts.join(' | ') : (error?.message || 'Unable to load feed data.');
}

export const useFeedStore = create((set, get) => ({
  ...initialState,
  syncFeedDebug: () => set(getLiveDataDebug()),

  setSymbol: (symbol) => set({ symbol: String(symbol || '').toUpperCase() || 'SPY' }),
  setTimeframe: (timeframe) => set({ timeframe: timeframe || '1m' }),

  clearError: () => set({ error: '' }),

  loadProviders: async () => {
    set({ credentialsLoading: true, credentialsError: '' });
    try {
      const payload = await api.getFeedProviders();
      const providers = Array.isArray(payload?.providers) ? payload.providers : (Array.isArray(payload) ? payload : []);
      const providerCredentialsStatus = {};
      providers.forEach((provider) => {
        const key = provider?.provider || provider?.id || provider?.name;
        if (!key) return;
        providerCredentialsStatus[key] = provider?.credentialsStatus || provider?.status || 'unknown';
      });
      set({ providers, providerCredentialsStatus, credentialsLoading: false });
      return providers;
    } catch (error) {
      get().syncFeedDebug();
      set({ credentialsLoading: false, credentialsError: normalizeError(error) });
      return [];
    }
  },

  toggleProvider: (provider) => set((state) => {
    const selectedProviders = state.selectedProviders.includes(provider)
      ? state.selectedProviders.filter((p) => p !== provider)
      : [...state.selectedProviders, provider];
    return { selectedProviders };
  }),

  loadActiveProviders: async () => {
    set({ credentialsLoading: true, credentialsError: '' });
    try {
      const payload = await api.getActiveFeedProviders();
      const activeProviders = Array.isArray(payload?.providers) ? payload.providers : [];
      set({ activeProviders, selectedProviders: activeProviders, credentialsLoading: false });
      return activeProviders;
    } catch (error) {
      get().syncFeedDebug();
      set({ credentialsLoading: false, credentialsError: normalizeError(error) });
      return [];
    }
  },

  saveActiveProviders: async () => {
    const { selectedProviders, symbol } = get();
    set({ credentialsLoading: true, credentialsError: '' });
    try {
      const result = await api.setActiveFeedProviders(selectedProviders, [symbol]);
      set({ activeProviders: selectedProviders, credentialsLoading: false });
      return result;
    } catch (error) {
      get().syncFeedDebug();
      set({ credentialsLoading: false, credentialsError: normalizeError(error) });
      return null;
    }
  },

  updateCredentialField: (provider, field, value) => set((state) => ({
    credentialsDraft: {
      ...state.credentialsDraft,
      [provider]: {
        ...(state.credentialsDraft[provider] || {}),
        [field]: value,
      },
    },
  })),

  saveCredentials: async (provider) => {
    const draft = get().credentialsDraft[provider] || {};
    set({ credentialsLoading: true, credentialsError: '' });
    try {
      const result = await api.saveFeedProviderCredentials(provider, draft);
      set((state) => ({
        credentialsLoading: false,
        providerCredentialsStatus: {
          ...state.providerCredentialsStatus,
          [provider]: result?.credentialsStatus || result?.status || 'configured',
        },
        credentialsDraft: { ...state.credentialsDraft, [provider]: {} },
      }));
      return result;
    } catch (error) {
      get().syncFeedDebug();
      set({ credentialsLoading: false, credentialsError: normalizeError(error) });
      return null;
    }
  },

  deleteCredentials: async (provider) => {
    set({ credentialsLoading: true, credentialsError: '' });
    try {
      const result = await api.deleteFeedProviderCredentials(provider);
      set((state) => ({
        credentialsLoading: false,
        providerCredentialsStatus: {
          ...state.providerCredentialsStatus,
          [provider]: result?.credentialsStatus || 'missing_credentials',
        },
      }));
      return result;
    } catch (error) {
      get().syncFeedDebug();
      set({ credentialsLoading: false, credentialsError: normalizeError(error) });
      return null;
    }
  },

  loadFeedStatus: async () => {
    set({ loading: true, error: '' });
    try {
      const payload = await api.getFeedStatus();
      const feedStatus = normalizeFeedStatusPayload(payload, get().activeProviders, get().providers);
      set({ feedStatus, loading: false, lastUpdated: new Date().toISOString() });
      return feedStatus;
    } catch (error) {
      get().syncFeedDebug();
      set({ loading: false, error: normalizeError(error) });
      return null;
    }
  },

  loadLatestMarketData: async () => {
    const { symbol, timeframe } = get();
    set({ loading: true, error: '' });
    try {
      const [latestTick, latestCandle, latestOrderBook] = await Promise.all([
        api.getLatestTick(symbol),
        api.getLatestCandle(symbol, timeframe),
        api.getLatestOrderBook(symbol),
      ]);

      set({ latestTick, latestCandle, latestOrderBook, loading: false, lastUpdated: new Date().toISOString() });
      return { latestTick, latestCandle, latestOrderBook };
    } catch (error) {
      get().syncFeedDebug();
      set({ loading: false, error: normalizeError(error) });
      return null;
    }
  },

  generateDemoMarketData: async () => {
    const { symbol } = get();
    set({ loading: true, error: '' });
    try {
      await Promise.all([
        api.generateDemoTick(symbol),
        api.generateDemoCandle(symbol),
        api.generateDemoOrderBook(symbol),
      ]);

      await get().refreshAll();
      return true;
    } catch (error) {
      get().syncFeedDebug();
      set({ loading: false, error: normalizeError(error) });
      return false;
    }
  },

  refreshAll: async () => {
    set({ loading: true, error: '' });
    try {
      await Promise.all([get().loadFeedStatus(), get().loadLatestMarketData(), get().loadProviders(), get().loadActiveProviders()]);
      set({ ...getLiveDataDebug(), loading: false, lastUpdated: new Date().toISOString() });
    } catch (error) {
      get().syncFeedDebug();
      set({ loading: false, error: normalizeError(error) });
    }
  },
}));
