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
      const feedStatus = await api.getFeedStatus();
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
