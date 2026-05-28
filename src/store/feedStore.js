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
  activeSymbols: [],
  providerCredentialsStatus: {},
  selectedProviders: [],
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

function uniqueStrings(values = []) {
  return [...new Set(asArray(values).map((v) => String(v || '').trim()).filter(Boolean))];
}

function deriveActiveProvidersFromPayload(payload, fallback = []) {
  const fromProviders = uniqueStrings(payload?.providers);
  const fromProviderOrder = uniqueStrings(payload?.providerOrder);
  const fromEnabledMap = uniqueStrings(
    Object.entries(payload?.enabledByProvider || {})
      .filter(([, enabled]) => enabled === true)
      .map(([name]) => name)
  );
  const merged = uniqueStrings([...fromProviders, ...fromProviderOrder, ...fromEnabledMap]);
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

function isValidProviderStatePayload(payload) {
  const providersValid = Array.isArray(payload?.providers) && payload.providers.length > 0;
  const providerOrderValid = Array.isArray(payload?.providerOrder) && payload.providerOrder.length > 0;
  const enabledByProviderValid = payload?.enabledByProvider && typeof payload.enabledByProvider === 'object' && !Array.isArray(payload.enabledByProvider);
  return providersValid || providerOrderValid || enabledByProviderValid;
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
      const mergedProviders = mergeProviderList(providers, get().providers);
      const providerCredentialsStatus = {};
      mergedProviders.forEach((provider) => {
        const key = provider?.provider || provider?.id || provider?.name;
        if (!key) return;
        providerCredentialsStatus[key] = provider?.credentialsStatus || provider?.status || 'unknown';
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
        return { providers: nextProviders, providerCredentialsStatus, selectedProviders: nextSelected, credentialsLoading: false };
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
    return { selectedProviders };
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

        return {
          activeProviders,
          activeSymbols,
          selectedProviders,
          lastValidActiveProviders: activeProviders.length ? activeProviders : state.lastValidActiveProviders,
          symbol: nextSymbol || state.symbol,
          hasHydratedProviders: true,
          providerHydrationInFlight: false,
          providerLastSyncAt: new Date().toISOString(),
          providerLastSyncSource: 'loadActiveProviders',
          credentialsLoading: false,
        };
      });
      return { activeProviders: activeProvidersFromApi, activeSymbols };
    } catch (error) {
      get().syncFeedDebug();
      set({ credentialsLoading: false, credentialsError: normalizeError(error), providerHydrationInFlight: false });
      return [];
    }
  },

  saveActiveProviders: async () => {
    const { selectedProviders, symbol } = get();
    set({ credentialsLoading: true, credentialsError: '' });
    try {
      const normalizedSymbol = String(symbol || '').trim().toUpperCase() || 'SPY';
      const symbols = [normalizedSymbol];
      const requestedProviders = uniqueStrings(selectedProviders);
      const result = await api.setActiveFeedProviders(requestedProviders, symbols);
      await get().loadActiveProviders();
      await get().loadFeedStatus();
      set({ credentialsLoading: false, symbol: normalizedSymbol || get().symbol });
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

      await Promise.all([get().loadLatestMarketData(), get().loadFeedStatus()]);
      set({ loading: false, lastUpdated: new Date().toISOString() });
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
      const before = get();
      console.debug('[feedStore] refreshAll start', {
        activeProviders: before.activeProviders,
        selectedProviders: before.selectedProviders,
      });
      if (!get().providerHydrationInFlight) {
        set({ providerHydrationInFlight: true });
        await get().loadActiveProviders();
      }
      await get().loadProviders();
      await Promise.all([get().loadFeedStatus(), get().loadLatestMarketData()]);
      const after = get();
      console.debug('[feedStore] refreshAll done', {
        activeProviders: after.activeProviders,
        selectedProviders: after.selectedProviders,
      });
      set({ ...getLiveDataDebug(), loading: false, lastUpdated: new Date().toISOString() });
    } catch (error) {
      get().syncFeedDebug();
      set({ loading: false, error: normalizeError(error) });
    }
  },

  initializeFeedWorkspace: async () => {
    console.debug('[feedStore] initializeFeedWorkspace start', { hydrationSource: 'backend_first' });
    if (!get().providerHydrationInFlight) {
      set({ providerHydrationInFlight: true });
      await get().loadActiveProviders();
      await get().loadProviders();
    }
    await Promise.all([get().loadFeedStatus(), get().loadLatestMarketData()]);
    console.debug('[feedStore] initializeFeedWorkspace done', {
      activeProviders: get().activeProviders,
      selectedProviders: get().selectedProviders,
    });
  },

  hydrateFromReplayCandles: ({ candles = [], source = '', symbol = '', timeframe = '' } = {}) => {
    const normalizedSource = normalizeProviderName(source) || String(source || 'unknown');
    const latest = Array.isArray(candles) && candles.length ? candles[candles.length - 1] : null;
    if (!latest) return;

    set((state) => {
      const normalizedSymbol = String(symbol || latest?.symbol || state.symbol || 'SPY').toUpperCase();
      const normalizedTimeframe = timeframe || state.timeframe || '1m';
      const latestCandle = {
        ...latest,
        symbol: normalizedSymbol,
        timeframe: latest?.timeframe || normalizedTimeframe,
        source: normalizeProviderName(latest?.source || normalizedSource) || normalizedSource,
        timestamp: latest?.timestamp ?? latest?.time ?? null,
      };
      const latestTick = state.latestTick || deriveTickFromCandle(latestCandle, normalizedSymbol);
      const replayProviderOrder = normalizeProviderList([
        normalizedSource,
        ...state.activeProviders,
        ...(state.feedStatus?.providerOrder || []),
      ]);
      const hasYahooReplay = normalizedSource === 'yahoo';
      const activeProviders = hasYahooReplay
        ? normalizeProviderList(['yahoo', ...state.activeProviders.filter((provider) => normalizeProviderName(provider) !== 'fallback_demo')])
        : normalizeProviderList(state.activeProviders.length ? state.activeProviders : [normalizedSource]);
      const providerOrder = hasYahooReplay
        ? normalizeProviderList(['yahoo', ...replayProviderOrder.filter((provider) => provider !== 'fallback_demo')])
        : replayProviderOrder;
      const statuses = providerOrder.map((providerName) => ({
        source: providerName,
        status: providerName === normalizedSource ? 'connected' : 'standby',
        connected: providerName === normalizedSource,
        symbols: [normalizedSymbol],
        warnings: providerName === 'yahoo' ? ['Yahoo feed is delayed/fallback, not institutional real-time.'] : [],
        active: activeProviders.includes(providerName),
        live: providerName === 'fallback_demo' ? 'demo' : 'live',
      }));
      const primary = statuses.find((entry) => entry.source === normalizedSource) || statuses[0] || null;
      const nextFeedStatus = {
        ...(state.feedStatus || {}),
        source: normalizedSource,
        status: primary?.status || 'connected',
        connected: true,
        symbols: [normalizedSymbol],
        warnings: hasYahooReplay ? [] : (primary?.warnings || []),
        activeProviders,
        providerOrder,
        statuses,
        activeStatuses: statuses.filter((entry) => entry.active),
        providers: providerOrder.map((provider) => ({ provider })),
        lastMessageAt: latestCandle.timestamp || new Date().toISOString(),
      };

      console.debug('[feedStore] replay payload received', { source: normalizedSource, candles: candles.length, symbol: normalizedSymbol, timeframe: normalizedTimeframe });
      console.debug('[feedStore] latest candle updated', latestCandle);
      console.debug('[feedStore] latest tick updated', latestTick);
      console.debug('[feedStore] provider runtime updated', { activeProviders, providerOrder, source: nextFeedStatus.source, connected: nextFeedStatus.connected });
      if (hasYahooReplay) {
        console.debug('[feedStore] fallback state cleared', {
          previousSource: state.feedStatus?.source,
          previousActiveProviders: state.activeProviders,
        });
      }
      console.debug('[feedStore] live state hydrated', {
        latestCandleTimestamp: latestCandle.timestamp,
        source: nextFeedStatus.source,
      });

      return {
        latestCandle,
        latestTick,
        feedStatus: nextFeedStatus,
        activeProviders,
        selectedProviders: activeProviders,
        lastValidActiveProviders: activeProviders,
        activeSymbols: [normalizedSymbol],
        symbol: normalizedSymbol,
        timeframe: normalizedTimeframe,
        hasHydratedProviders: true,
        providerLastSyncAt: new Date().toISOString(),
        providerLastSyncSource: 'replay_hydration',
        lastUpdated: new Date().toISOString(),
      };
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
      return {
        feedStatus,
        activeProviders: nextActiveProviders,
        selectedProviders: nextSelectedProviders,
        lastValidActiveProviders: nextActiveProviders.length ? nextActiveProviders : state.lastValidActiveProviders,
        providerLastSyncAt: new Date().toISOString(),
        providerLastSyncSource: 'providers/status',
      };
    });
  },
}));
