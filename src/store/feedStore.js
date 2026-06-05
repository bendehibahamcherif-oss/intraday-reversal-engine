import { create } from 'zustand';
import { api, getLiveDataDebug } from '../api.js';
import { useActiveSymbolStore } from './activeSymbolStore.js';

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
  activeSymbols: [],
  providerCredentialsStatus: {},
  providerCredentialsMeta: {},
  selectedProviders: [],
  providerSelectionDirty: false,
  hasHydratedProviders: false,
  lastValidActiveProviders: [],
  credentialsDraft: {},
  credentialsLoading: false,
  credentialsError: '',
  lastFeedUrl: '',
  lastFeedMethod: '',
  lastFeedError: '',
  apiBase: import.meta.env.VITE_API_BASE || 'http://localhost:10000',
  providerSelectionSavedAt: null,
  activeProvidersRequestSeq: 0,
  providerHydrationInFlight: false,
  providerLastSyncAt: null,
  providerLastSyncSource: '',
  runtime: {
    source: 'unknown',
    activeProviders: [],
    providerOrder: [],
    connected: false,
    healthy: false,
    lastUpdate: null,
    warnings: [],
  },
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
      entry?.runtimeStatus
      || entry?.status
      || entry?.state
      || (source === 'fallback_demo' ? 'idle_demo' : (connected ? 'connected' : 'disconnected'))
    );

    const nextWarnings = [...warnings];
    if (source === 'yahoo' && !nextWarnings.some((w) => String(w).toLowerCase().includes('delayed'))) {
      nextWarnings.push('Yahoo is delayed data, not live institutional feed.');
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
      runtimeStatus: entry?.runtimeStatus,
      credentialStatus: entry?.credentialStatus || entry?.credentialsStatus,
      sourceType: entry?.sourceType,
    });
  };

  const topLevel = payload?.status || payload?.feedStatus || payload;
  if (topLevel && typeof topLevel === 'object' && !Array.isArray(topLevel)) pushStatus(topLevel);
  asArray(payload?.statuses).forEach(pushStatus);
  providerMeta.forEach((provider) => {
    const providerName = pickProviderName(provider);
    if (!providerName) return;
    pushStatus({
      source: providerName,
      status: provider?.runtimeStatus || provider?.status || provider?.connectionStatus,
      runtimeStatus: provider?.runtimeStatus,
      credentialStatus: provider?.credentialStatus || provider?.credentialsStatus,
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

function uniqueStrings(values = []) {
  return [...new Set(asArray(values).map((v) => String(v || '').trim()).filter(Boolean))];
}

function deriveActiveProvidersFromPayload(payload, fallback = []) {
  const fromActiveProviders = uniqueStrings(payload?.activeProviders);
  if (fromActiveProviders.length) return fromActiveProviders;
  const fromProviders = uniqueStrings(asArray(payload?.providers).filter((p) => p?.active === true || p?.selected === true).map((p) => pickProviderName(p)));
  if (fromProviders.length) return fromProviders;
  const fromProviderOrder = uniqueStrings(payload?.providerOrder);
  const fromEnabledMap = uniqueStrings(
    Object.entries(payload?.enabledByProvider || {})
      .filter(([, enabled]) => enabled === true)
      .map(([name]) => name)
  );
  const merged = uniqueStrings([...fromProviderOrder, ...fromEnabledMap]);
  return merged.length ? merged : uniqueStrings(fallback);
}


function normalizeProviderName(value) {
  const name = String(value || '').trim().toLowerCase();
  if (!name) return '';
  if (name === 'alphavantage') return 'alphaVantage';
  if (name === 'fallback' || name === 'demo') return 'fallback_demo';
  return name;
}

function normalizeProviderList(values = []) {
  return uniqueStrings(values.map((value) => normalizeProviderName(value))).filter(Boolean);
}

function deriveTickFromCandle(candle, symbol) {
  if (!candle) return null;
  const close = Number(candle?.close);
  if (!Number.isFinite(close)) return null;
  const timestamp = candle?.timestamp ?? candle?.time ?? null;
  return {
    symbol: String(candle?.symbol || symbol || 'SPY').toUpperCase(),
    price: close,
    bid: Number.isFinite(Number(candle?.low)) ? Number(candle.low) : close,
    ask: Number.isFinite(Number(candle?.high)) ? Number(candle.high) : close,
    volume: Number.isFinite(Number(candle?.volume)) ? Number(candle.volume) : 0,
    source: String(candle?.source || 'unknown'),
    timestamp,
    sequence: `replay-${timestamp || Date.now()}`,
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

function mergeProviderList(incoming = [], fallback = []) {
  const unique = [];
  const seen = new Set();
  [...asArray(incoming), ...asArray(fallback)].forEach((provider) => {
    const key = pickProviderName(provider);
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(provider);
  });
  return unique;
}


function buildRuntimeFromFeedStatus(feedStatus = {}, fallbackRuntime = {}) {
  const activeProviders = normalizeProviderList(feedStatus?.activeProviders || fallbackRuntime?.activeProviders || []);
  const providerOrder = normalizeProviderList(feedStatus?.providerOrder || feedStatus?.statuses?.map((s) => s?.source) || activeProviders);
  const source = normalizeProviderName(feedStatus?.source || fallbackRuntime?.source || providerOrder[0] || 'unknown') || 'unknown';
  const warnings = asArray(feedStatus?.warnings || fallbackRuntime?.warnings || []);
  const primaryStatus = String(feedStatus?.status || feedStatus?.runtimeStatus || '').toLowerCase();
  const connected = feedStatus?.connected === true;
  const delayed = primaryStatus === 'delayed' || primaryStatus.includes('delayed');
  const healthy = (connected || delayed) && source !== 'fallback_demo';
  return {
    source,
    activeProviders,
    providerOrder,
    connected,
    healthy,
    lastUpdate: new Date().toISOString(),
    warnings,
  };
}

function mirrorRuntimeFields(runtime = {}, state = {}) {
  const activeProviders = runtime.activeProviders || [];
  return {
    activeProviders,
    selectedProviders: state.providerSelectionDirty ? (state.selectedProviders || []) : activeProviders,
    lastValidActiveProviders: activeProviders,
  };
}

function credentialStatusFromProvider(provider = {}) {
  return provider?.credentialStatus || provider?.credentialsStatus || provider?.status || 'unknown';
}

function credentialsMetaFromPayload(payload = {}) {
  const meta = {};
  Object.entries(payload?.credentials || {}).forEach(([provider, value]) => {
    meta[provider] = value;
  });
  return meta;
}

function isValidProviderStatePayload(payload) {
  const providersValid = Array.isArray(payload?.providers) && payload.providers.length > 0;
  const providerOrderValid = Array.isArray(payload?.providerOrder) && payload.providerOrder.length > 0;
  const enabledByProviderValid = payload?.enabledByProvider && typeof payload.enabledByProvider === 'object' && !Array.isArray(payload.enabledByProvider);
  return providersValid || providerOrderValid || enabledByProviderValid;
}

// Module-level AbortController for loadLatestMarketData — one active request at a time.
let _marketAbort = null;

export const useFeedStore = create((set, get) => ({
  ...initialState,
  syncFeedDebug: () => set(getLiveDataDebug()),

  setSymbol: (symbol) => {
    const nextSymbol = String(symbol || '').toUpperCase() || 'SPY';
    console.debug('[feedStore] symbol switch delegated to activeSymbolStore', { previous: get().symbol, next: nextSymbol });
    useActiveSymbolStore.getState().setSymbol(nextSymbol);
    // Mirror updated synchronously via the subscription at module bottom.
  },
  setTimeframe: (timeframe) => set({ timeframe: timeframe || '1m' }),

  clearError: () => set({ error: '' }),


  loadProviderCredentials: async () => {
    set({ credentialsLoading: true, credentialsError: '' });
    try {
      const payload = await api.listProviderCredentials();
      const providerCredentialsMeta = credentialsMetaFromPayload(payload);
      const providerCredentialsStatus = {};
      Object.entries(providerCredentialsMeta).forEach(([provider, info]) => {
        providerCredentialsStatus[provider] = info?.configured ? 'configured' : 'missing';
      });
      set((state) => ({
        providerCredentialsMeta,
        providerCredentialsStatus: { ...state.providerCredentialsStatus, ...providerCredentialsStatus },
        credentialsLoading: false,
      }));
      return providerCredentialsMeta;
    } catch (error) {
      get().syncFeedDebug();
      set({ credentialsLoading: false, credentialsError: normalizeError(error) });
      return {};
    }
  },

  loadProviders: async () => {
    set({ credentialsLoading: true, credentialsError: '' });
    try {
      const payload = await api.getFeedProviders();
      const providers = Array.isArray(payload?.providers) ? payload.providers : (Array.isArray(payload) ? payload : []);
      const mergedProviders = mergeProviderList(providers, get().providers);
      const providerCredentialsStatus = {};
      mergedProviders.forEach((provider) => {
        const key = provider?.provider || provider?.id || provider?.name;
        if (!key) return;
        providerCredentialsStatus[key] = credentialStatusFromProvider(provider);
      });
      const providerNames = uniqueStrings(providers.map((p) => pickProviderName(p)));
      set((state) => {
        const hasIncomingProviders = providerNames.length > 0;
        const nextProviders = hasIncomingProviders ? mergedProviders : state.providers;
        const nextSelected = state.selectedProviders;
        if (!hasIncomingProviders) {
          console.debug('[feedStore] stale provider overwrite prevented (catalog)', {
            hydrationSource: state.hasHydratedProviders ? 'backend_hydrated' : 'pre_hydration',
            backendPayload: payload,
            preservedSelectedProviders: nextSelected,
          });
        }
        console.debug('[feedStore] loadProviders sync', {
          before: {
            providers: state.providers.map((p) => pickProviderName(p)),
            selectedProviders: state.selectedProviders,
          },
          backendPayload: payload,
          overwriteDetected: !hasIncomingProviders,
          after: {
            providers: nextProviders.map((p) => pickProviderName(p)),
            selectedProviders: nextSelected,
          },
        });
        return { providers: nextProviders, providerCredentialsStatus: { ...state.providerCredentialsStatus, ...providerCredentialsStatus }, selectedProviders: nextSelected, credentialsLoading: false };
      });
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
    return { selectedProviders, providerSelectionDirty: true };
  }),

  loadActiveProviders: async () => {
    const requestSeq = get().activeProvidersRequestSeq + 1;
    set({ credentialsLoading: true, credentialsError: '', activeProvidersRequestSeq: requestSeq });
    try {
      const payload = await api.getActiveFeedProviders();
      const activeProvidersFromApi = deriveActiveProvidersFromPayload(payload);
      const activeSymbols = Array.isArray(payload?.symbols) ? payload.symbols : [];
      const nextSymbol = String(activeSymbols[0] || '').trim().toUpperCase();
      console.debug('[feedStore] activeProviders backend payload', payload);
      set((state) => {
        if (requestSeq !== state.activeProvidersRequestSeq) {
          console.debug('[feedStore] loadActiveProviders stale response ignored', {
            requestSeq,
            expectedSeq: state.activeProvidersRequestSeq,
            backendPayload: payload,
          });
          return { credentialsLoading: false };
        }
        const fallbackActive = uniqueStrings(state.lastValidActiveProviders.length ? state.lastValidActiveProviders : state.activeProviders);
        const malformedActiveProviders = !Array.isArray(payload?.providers) && !Array.isArray(payload?.providerOrder);
        const shouldPreservePrevious = (state.hasHydratedProviders && activeProvidersFromApi.length === 0 && fallbackActive.length > 0)
          || (state.hasHydratedProviders && malformedActiveProviders && fallbackActive.length > 0);
        const activeProviders = shouldPreservePrevious ? fallbackActive : activeProvidersFromApi;
        const selectedProviders = activeProviders.length
          ? activeProviders
          : (state.hasHydratedProviders ? state.selectedProviders : uniqueStrings(state.selectedProviders));
        if (shouldPreservePrevious) {
          console.debug('[feedStore] stale provider overwrite prevented (activeProviders)', {
            hydrationSource: state.hasHydratedProviders ? 'backend_hydrated' : 'pre_hydration',
            backendPayload: payload,
            preservedActiveProviders: fallbackActive,
            malformedActiveProviders,
          });
        }

        const before = {
          activeProviders: state.activeProviders,
          selectedProviders: state.selectedProviders,
          hasHydratedProviders: state.hasHydratedProviders,
        };
        const backendPayload = { providers: activeProvidersFromApi, symbols: activeSymbols, raw: payload };
        const after = { activeProviders, selectedProviders };
        console.debug('[feedStore] loadActiveProviders sync', {
          before,
          backendPayload,
          shouldPreservePrevious,
          overwriteDetected: shouldPreservePrevious,
          after,
        });

        const runtime = { ...(state.runtime || {}), activeProviders, providerOrder: activeProviders.length ? activeProviders : (state.runtime?.providerOrder || []), lastUpdate: new Date().toISOString() };
        const providerCredentialsStatus = {};
        asArray(payload?.providers).forEach((provider) => {
          const key = pickProviderName(provider);
          if (key) providerCredentialsStatus[key] = credentialStatusFromProvider(provider);
        });
        return { activeProviders, activeSymbols, selectedProviders, providerSelectionDirty: false, lastValidActiveProviders: activeProviders.length ? activeProviders : state.lastValidActiveProviders, runtime, hasHydratedProviders: true, providerHydrationInFlight: false, providerLastSyncAt: new Date().toISOString(), providerLastSyncSource: 'loadActiveProviders', credentialsLoading: false, providerCredentialsStatus: { ...state.providerCredentialsStatus, ...providerCredentialsStatus } };
      });
      return { activeProviders: activeProvidersFromApi, activeSymbols };
    } catch (error) {
      get().syncFeedDebug();
      set({ credentialsLoading: false, credentialsError: normalizeError(error), providerHydrationInFlight: false });
      return [];
    }
  },

  saveActiveProviders: async () => {
    const { selectedProviders } = get();
    const symbol = useActiveSymbolStore.getState().symbol;
    set({ credentialsLoading: true, credentialsError: '' });
    try {
      const requestedProviders = uniqueStrings(selectedProviders);
      const result = await api.setActiveFeedProviders(requestedProviders, [symbol]);
      await get().loadActiveProviders();
      await get().loadFeedStatus();
      set({ credentialsLoading: false, providerSelectionDirty: false, providerSelectionSavedAt: new Date().toISOString() });
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
      await get().loadProviderCredentials();
      await get().loadActiveProviders();
      await get().loadFeedStatus();
      set((state) => ({
        credentialsLoading: false,
        providerCredentialsStatus: {
          ...state.providerCredentialsStatus,
          [provider]: result?.provider?.credentialStatus || 'configured',
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
      await get().loadProviderCredentials();
      await get().loadActiveProviders();
      await get().loadFeedStatus();
      set((state) => ({
        credentialsLoading: false,
        providerCredentialsStatus: {
          ...state.providerCredentialsStatus,
          [provider]: result?.provider?.credentialStatus || 'missing',
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
      const currentState = get();
      const payload = await api.getFeedStatus();
      const fallbackProviders = currentState.lastValidActiveProviders.length
        ? currentState.lastValidActiveProviders
        : currentState.activeProviders;
      const feedStatus = normalizeFeedStatusPayload(payload, fallbackProviders, currentState.providers);
      console.debug('[feedStore] loadFeedStatus sync', {
        before: {
          activeProviders: currentState.activeProviders,
          selectedProviders: currentState.selectedProviders,
        },
        backendPayload: payload,
        after: {
          feedActiveProviders: feedStatus?.activeProviders,
          source: feedStatus?.source,
          status: feedStatus?.status,
        },
      });
      const runtime = buildRuntimeFromFeedStatus(feedStatus, currentState.runtime);
      set((state) => {
        const providerCredentialsStatus = {};
        // Extract credential status from provider metadata (PR #89 approach)
        asArray(payload?.providers).forEach((provider) => {
          const key = pickProviderName(provider);
          if (key) providerCredentialsStatus[key] = credentialStatusFromProvider(provider);
        });
        // Also sync from feed status entries: if a status entry reports
        // missing_credentials, ensure it surfaces in both panels consistently
        asArray(feedStatus?.statuses).forEach((entry) => {
          if (!entry?.source) return;
          if (entry.status === 'missing_credentials') {
            providerCredentialsStatus[entry.source] = 'missing_credentials';
          } else if (entry.credentialsStatus && !providerCredentialsStatus[entry.source]) {
            providerCredentialsStatus[entry.source] = entry.credentialsStatus;
          }
        });
        return { feedStatus, runtime, ...mirrorRuntimeFields(runtime, state), providerCredentialsStatus: { ...state.providerCredentialsStatus, ...providerCredentialsStatus }, loading: false, lastUpdated: new Date().toISOString() };
      });
      console.debug('[feedStore] runtime source updated', runtime);
      return feedStatus;
    } catch (error) {
      get().syncFeedDebug();
      set({ loading: false, error: normalizeError(error) });
      return null;
    }
  },

  loadLatestMarketData: async () => {
    // Cancel any in-flight market data request.
    if (_marketAbort) {
      _marketAbort.abort();
    }
    _marketAbort = new AbortController();
    const signal = _marketAbort.signal;

    const symbol = get().symbol; // mirror, always synced from activeSymbolStore
    const { timeframe } = get();
    set({ loading: true, error: '' });
    console.debug('[feedStore] loading market data', { symbol, timeframe });
    try {
      const [tickPayload, candlePayload, orderBookPayload] = await Promise.all([
        api.getLatestTick(symbol, signal),
        api.getLatestCandle(symbol, timeframe, signal),
        api.getLatestOrderBook(symbol, signal),
      ]);
      const latestTick = tickPayload?.tick || tickPayload?.data || (tickPayload?.price !== undefined ? tickPayload : null);
      const latestCandle = candlePayload?.candle || candlePayload?.data || (candlePayload?.close !== undefined ? candlePayload : null);
      const latestOrderBook = orderBookPayload?.orderBook || orderBookPayload?.orderbook || orderBookPayload?.data || (orderBookPayload?.bids ? orderBookPayload : null);

      // Post-fetch guard: discard if symbol changed while requests were in flight.
      if (get().symbol !== symbol) {
        console.warn('[feedStore] stale market data ignored', { requested: symbol, current: get().symbol });
        return null;
      }

      set({ latestTick, latestCandle, latestOrderBook, loading: false, lastUpdated: new Date().toISOString() });
      return { latestTick, latestCandle, latestOrderBook };
    } catch (error) {
      if (error?.name === 'AbortError') {
        console.debug('[feedStore] market data request aborted cleanly');
        return null;
      }
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

      await Promise.all([get().loadLatestMarketData(), get().loadFeedStatus()]);
      set({ loading: false, lastUpdated: new Date().toISOString() });
      return true;
    } catch (error) {
      get().syncFeedDebug();
      set({ loading: false, error: normalizeError(error) });
      return false;
    }
  },

  refreshProviderRuntime: async () => {
    if (!get().providerHydrationInFlight) set({ providerHydrationInFlight: true });
    await get().loadActiveProviders();
    await get().loadProviders();
    await get().loadFeedStatus();
  },

  refreshChartData: async () => {
    await get().loadLatestMarketData();
  },

  refreshMarketData: async () => {
    await get().loadLatestMarketData();
  },

  refreshAll: async () => {
    set({ loading: true, error: '' });
    try {
      await get().refreshProviderRuntime();
      await get().refreshMarketData();
      set({ ...getLiveDataDebug(), loading: false, lastUpdated: new Date().toISOString() });
    } catch (error) {
      get().syncFeedDebug();
      set({ loading: false, error: normalizeError(error) });
    }
  },

  initializeFeedWorkspace: async () => {
    console.debug('[feedStore] provider runtime hydration start', { hydrationOrder: [1,2,3,4] });
    set({ providerHydrationInFlight: true });
    await get().loadProviderCredentials(); // 0 credential status
    await get().loadActiveProviders(); // 1 runtime
    await get().loadFeedStatus(); // 2 status
    await get().loadLatestMarketData(); // 3/4 market
    await get().loadProviders();
    console.debug('[feedStore] provider runtime hydration done', { runtime: get().runtime });
  },

  hydrateFromReplayCandles: ({ candles = [], source = '', symbol = '', timeframe = '' } = {}) => {
    const normalizedSource = normalizeProviderName(source) || String(source || 'unknown');
    const latest = Array.isArray(candles) && candles.length ? candles[candles.length - 1] : null;
    if (!latest) return;

    set((state) => {
      const normalizedSymbol = String(symbol || latest?.symbol || state.symbol || 'SPY').toUpperCase();
      const normalizedTimeframe = timeframe || state.timeframe || '1m';
      const latestCandle = { ...latest, symbol: normalizedSymbol, timeframe: latest?.timeframe || normalizedTimeframe, source: normalizeProviderName(latest?.source || normalizedSource) || normalizedSource, timestamp: latest?.timestamp ?? latest?.time ?? null };
      const latestTick = state.latestTick || deriveTickFromCandle(latestCandle, normalizedSymbol);
      const nextFeedStatus = { ...(state.feedStatus || {}), symbols: [normalizedSymbol], lastMessageAt: latestCandle.timestamp || new Date().toISOString() };
      if (normalizedSource === 'yahoo' && state.runtime?.source === 'fallback_demo') {
        console.debug('[feedStore] stale fallback removal', { previousRuntimeSource: state.runtime?.source, nextRuntimeSource: 'yahoo' });
      }
      console.debug('[feedStore] replay candle hydration (market data only, no runtime/symbol/timeframe mutation)', { incomingSource: normalizedSource, symbol: normalizedSymbol });
      return { latestCandle, latestTick, feedStatus: nextFeedStatus, activeSymbols: [normalizedSymbol], hasHydratedProviders: true, lastUpdated: new Date().toISOString() };
    });
  },


  // Ingest a realtime tick from the WS stream without triggering a full reload.
  // Only updates latestTick (and latestCandle close) for the active symbol.
  // Never overwrites provider runtime, activeProviders, or source.
  ingestRealtimeTick: (tick) => {
    if (!tick || !tick.symbol) return;
    const sym = String(tick.symbol || '').toUpperCase();
    const currentSym = get().symbol;
    if (sym !== currentSym) {
      console.debug('[feedStore] realtime tick ignored (symbol mismatch)', { tickSym: sym, storeSym: currentSym });
      return;
    }
    const price = Number(tick.price);
    if (!Number.isFinite(price)) return;

    console.debug('[feedStore] realtime tick ingested', { symbol: sym, price, source: tick.source, ts: tick.timestamp });
    set((state) => {
      const nextTick = { ...tick, symbol: sym };
      // Update latestCandle.close without replacing full candle structure
      const prevCandle = state.latestCandle;
      const nextCandle = prevCandle
        ? {
            ...prevCandle,
            close: price,
            high: Math.max(Number(prevCandle.high) || price, price),
            low: Math.min(Number(prevCandle.low) || price, price),
          }
        : prevCandle;
      return { latestTick: nextTick, latestCandle: nextCandle, lastUpdated: new Date().toISOString() };
    });
  },

  syncProvidersFromBackendStatus: async () => {
    const payload = await api.getFeedStatus();
    set((state) => {
      const before = {
        providers: state.providers.map((p) => pickProviderName(p)),
        activeProviders: state.activeProviders,
        selectedProviders: state.selectedProviders,
      };

      if (!isValidProviderStatePayload(payload)) {
        console.warn('[feedStore] stale provider overwrite prevented (status payload invalid)', {
          before,
          backendPayload: payload,
        });
        return {};
      }

      const providerNames = uniqueStrings([
        ...asArray(payload?.providerOrder),
        ...Object.keys(payload?.enabledByProvider || {}),
        ...asArray(payload?.providers).map((p) => pickProviderName(p)),
      ]);

      const fallbackProviders = providerNames.length ? providerNames : state.activeProviders;
      const feedStatus = normalizeFeedStatusPayload(payload, fallbackProviders, state.providers);
      const nextActiveProviders = deriveActiveProvidersFromPayload(payload, payload?.activeProviders?.length ? payload.activeProviders : state.activeProviders);
      const nextSelectedProviders = nextActiveProviders.length ? nextActiveProviders : state.selectedProviders;
      const after = {
        providers: state.providers.map((p) => pickProviderName(p)),
        activeProviders: nextActiveProviders,
        selectedProviders: nextSelectedProviders,
      };
      console.debug('[feedStore] syncProvidersFromBackendStatus', { before, backendPayload: payload, after });
      const runtime = buildRuntimeFromFeedStatus(feedStatus, state.runtime);
      return { feedStatus, runtime, ...mirrorRuntimeFields(runtime, state), providerLastSyncAt: new Date().toISOString(), providerLastSyncSource: 'providers/status' };
    });
  },
}));

// Keep feedStore.symbol mirror in sync with the single source of truth (activeSymbolStore).
// This allows workspace components that already read feedStore.symbol to work without changes.
useActiveSymbolStore.subscribe((state) => {
  if (useFeedStore.getState().symbol !== state.symbol) {
    console.debug('[feedStore] symbol mirror synced', { symbol: state.symbol });
    useFeedStore.setState({ symbol: state.symbol });
  }
});
