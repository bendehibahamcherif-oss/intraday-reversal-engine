import { create } from 'zustand';
import { api } from '../api.js';
import wsClient from '../services/wsClient.js';

// Canonical frontend runtime authority for the MarketStreamEngine integration.
// Polls /api/market/runtime, /api/providers/health, /api/market/subscriptions every N seconds.
// All three REST calls degrade gracefully: a 404 or network error leaves existing state intact.
// WS transport health (connected, latency, stale, reconnectCount) is wired from wsClient lifecycle.

const FALLBACK_SOURCES = new Set(['', 'unknown', 'fallback_demo', 'idle_demo', 'demo']);

function isFallback(source) {
  const s = String(source || '').toLowerCase().trim();
  return FALLBACK_SOURCES.has(s) || s.includes('fallback') || s.includes('demo');
}

function safeArray(v) { return Array.isArray(v) ? v : []; }
function safeObj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

// Monotonic seq guard — discard if a newer hydration finished first.
let _seq = 0;

const initialState = {
  // Provider / source runtime
  connected: false,
  source: 'unknown',
  activeProvider: 'unknown',
  activeProviders: [],
  providerOrder: [],
  subscribedSymbols: [],
  latency: null,
  reconnectCount: 0,
  stale: false,
  warnings: [],
  lastUpdate: null,
  providerHealth: {},
  capabilities: {},
  // Internal
  _pollId: null,
  _endpointsAvailable: { runtime: null, health: null, subscriptions: null },
};

export const useMarketRuntimeStore = create((set, get) => ({
  ...initialState,

  // ─── Hydrate from all three backend endpoints ───────────────────────────────
  hydrate: async () => {
    const mySeq = ++_seq;
    console.debug('[marketRuntime] hydrate start', { seq: mySeq });

    const [runtimeRes, healthRes, subscriptionsRes] = await Promise.allSettled([
      api.getMarketRuntime().catch((err) => { console.debug('[marketRuntime] /market/runtime unavailable', err?.message?.slice(0, 80)); return null; }),
      api.getProvidersHealth().catch((err) => { console.debug('[marketRuntime] /providers/health unavailable', err?.message?.slice(0, 80)); return null; }),
      api.getMarketSubscriptions().catch((err) => { console.debug('[marketRuntime] /market/subscriptions unavailable', err?.message?.slice(0, 80)); return null; }),
    ]);

    if (mySeq !== _seq) {
      console.debug('[marketRuntime] stale hydration discarded', { seq: mySeq, current: _seq });
      return;
    }

    const runtime = runtimeRes.value ?? null;
    const health = healthRes.value ?? null;
    const subscriptions = subscriptionsRes.value ?? null;

    set((state) => {
      const next = {};
      const available = { ...state._endpointsAvailable };

      // ── Runtime payload ───────────────────────────────────────────────────
      if (runtime && typeof runtime === 'object') {
        available.runtime = true;
        const rawSource = String(runtime.source || runtime.activeProvider || '');
        const rawProvider = String(runtime.activeProvider || runtime.source || '');
        // Stale-overwrite prevention: don't downgrade real source to fallback/unknown
        const nextSource = (!isFallback(rawSource) || isFallback(state.source)) ? (rawSource || state.source) : state.source;
        const nextProvider = (!isFallback(rawProvider) || isFallback(state.activeProvider)) ? (rawProvider || state.activeProvider) : state.activeProvider;

        const incomingActive = safeArray(runtime.activeProviders).length
          ? safeArray(runtime.activeProviders)
          : safeArray(runtime.providers);
        const nextActive = incomingActive.length ? incomingActive : state.activeProviders;

        const incomingOrder = safeArray(runtime.providerOrder);
        const nextOrder = incomingOrder.length ? incomingOrder : state.providerOrder;

        const nextWarnings = Array.isArray(runtime.warnings) ? runtime.warnings : state.warnings;
        const nextCaps = Object.keys(safeObj(runtime.capabilities)).length
          ? runtime.capabilities
          : state.capabilities;

        Object.assign(next, {
          source: nextSource,
          activeProvider: nextProvider,
          activeProviders: nextActive,
          providerOrder: nextOrder,
          warnings: nextWarnings,
          capabilities: nextCaps,
          ...(typeof runtime.reconnectCount === 'number' ? { reconnectCount: runtime.reconnectCount } : {}),
          ...(runtime.stale !== undefined ? { stale: Boolean(runtime.stale) } : {}),
        });

        console.debug('[marketRuntime] runtime merged', { source: nextSource, activeProvider: nextProvider, activeProviders: nextActive });
      } else if (runtime !== null) {
        available.runtime = false;
      }

      // ── Provider health ───────────────────────────────────────────────────
      if (health && typeof health === 'object') {
        available.health = true;
        // Backend may return { providers: {...} } or flat { polygon: {...}, ... }
        const map = safeObj(health.providers || health.health || health);
        if (Object.keys(map).length > 0) {
          // Merge: keep existing entries if incoming doesn't replace them
          next.providerHealth = { ...state.providerHealth, ...map };
          console.debug('[marketRuntime] health merged', { providers: Object.keys(map) });
        }
      } else if (health !== null) {
        available.health = false;
      }

      // ── Subscriptions ─────────────────────────────────────────────────────
      if (subscriptions && typeof subscriptions === 'object') {
        available.subscriptions = true;
        const syms = safeArray(subscriptions.symbols || subscriptions.subscriptions || subscriptions);
        if (syms.length > 0 || state.subscribedSymbols.length === 0) {
          next.subscribedSymbols = syms.map((s) => String(s || '').toUpperCase()).filter(Boolean);
          console.debug('[marketRuntime] subscriptions merged', { symbols: next.subscribedSymbols });
        }
      } else if (subscriptions !== null) {
        available.subscriptions = false;
      }

      return { ...next, lastUpdate: new Date().toISOString(), _endpointsAvailable: available };
    });
  },

  // ─── Symbol subscription lifecycle ──────────────────────────────────────────
  subscribeSymbol: async (symbol) => {
    const sym = String(symbol || '').toUpperCase();
    if (!sym) return;
    if (get().subscribedSymbols.includes(sym)) {
      console.debug('[marketRuntime] subscribeSymbol: already subscribed', { symbol: sym });
      return;
    }
    console.debug('[marketRuntime] subscribeSymbol', { symbol: sym });
    // Optimistic local update
    set((state) => ({ subscribedSymbols: [...new Set([...state.subscribedSymbols, sym])] }));
    // Best-effort backend call (404 = endpoint not yet deployed; degrade silently)
    try {
      await api.subscribeMarketSymbol(sym);
      console.debug('[marketRuntime] subscribeSymbol backend confirmed', { symbol: sym });
    } catch (err) {
      console.debug('[marketRuntime] subscribeSymbol backend unavailable (graceful degrade)', { symbol: sym, err: err?.message?.slice(0, 60) });
    }
  },

  unsubscribeSymbol: async (symbol) => {
    const sym = String(symbol || '').toUpperCase();
    if (!sym) return;
    if (!get().subscribedSymbols.includes(sym)) {
      console.debug('[marketRuntime] unsubscribeSymbol: not subscribed', { symbol: sym });
      return;
    }
    console.debug('[marketRuntime] unsubscribeSymbol', { symbol: sym });
    set((state) => ({ subscribedSymbols: state.subscribedSymbols.filter((s) => s !== sym) }));
    try {
      await api.unsubscribeMarketSymbol(sym);
      console.debug('[marketRuntime] unsubscribeSymbol backend confirmed', { symbol: sym });
    } catch (err) {
      console.debug('[marketRuntime] unsubscribeSymbol backend unavailable (graceful degrade)', { symbol: sym, err: err?.message?.slice(0, 60) });
    }
  },

  // ─── Polling ────────────────────────────────────────────────────────────────
  startPolling: (intervalMs = 7000) => {
    const existing = get()._pollId;
    if (existing) clearInterval(existing);
    get().hydrate(); // immediate first hydration
    const id = setInterval(() => get().hydrate(), Math.max(5000, intervalMs));
    set({ _pollId: id });
    console.debug('[marketRuntime] polling started', { intervalMs });
  },

  stopPolling: () => {
    const id = get()._pollId;
    if (id) {
      clearInterval(id);
      set({ _pollId: null });
      console.debug('[marketRuntime] polling stopped');
    }
  },

  // ─── WS transport sync (called by socketStore) ───────────────────────────────
  syncWsState: ({ connected, latency, stale, reconnectCount } = {}) => {
    set((state) => ({
      connected: connected !== undefined ? Boolean(connected) : state.connected,
      latency: latency !== undefined ? latency : state.latency,
      stale: stale !== undefined ? Boolean(stale) : state.stale,
      reconnectCount: reconnectCount !== undefined ? reconnectCount : state.reconnectCount,
    }));
  },
}));

// Wire wsClient lifecycle → marketRuntimeStore immediately at module load.
// This ensures connection state is always reflected regardless of component mount order.
wsClient.onConnect((reconnectCount) => {
  console.debug('[marketRuntime] ws connected', { reconnectCount });
  useMarketRuntimeStore.getState().syncWsState({ connected: true, reconnectCount, stale: false });
});
wsClient.onDisconnect((reconnectCount) => {
  console.debug('[marketRuntime] ws disconnected', { reconnectCount });
  useMarketRuntimeStore.getState().syncWsState({ connected: false, reconnectCount });
});
// Sync immediately if wsClient is already connected when this module is first imported.
if (wsClient.connected) {
  useMarketRuntimeStore.getState().syncWsState({ connected: true, reconnectCount: wsClient.reconnectCount, stale: false });
}
