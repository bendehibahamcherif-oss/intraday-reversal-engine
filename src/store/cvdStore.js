import { create } from 'zustand';
import { api } from '../api.js';
import wsClient from '../services/wsClient.js';
import { useActiveSymbolStore } from './activeSymbolStore.js';

// ── Constants ─────────────────────────────────────────────────────────────────
// Source hierarchy labels (backend sets one of these three values)
export const CVD_SOURCES = {
  bid_ask_tick: 'Bid/Ask Tick',
  l1_midpoint:  'L1 Midpoint Approx',
  ohlcv_synthetic: 'OHLCV Synthetic',
};

// Sources that trigger the approximation/fallback badge in the UI
export const FALLBACK_SOURCES = new Set(['l1_midpoint', 'ohlcv_synthetic']);

// ── Normaliser ────────────────────────────────────────────────────────────────
function normalizeCVD(payload) {
  // Handles both REST response { ok, cvd: {...} } and flat WS push shapes.
  const cvd = payload?.cvd || payload?.result || payload || {};
  const bars = Array.isArray(cvd?.bars)
    ? cvd.bars
    : Array.isArray(cvd?.cumulative)
      ? cvd.cumulative.map((b) => ({ ...b, delta: b?.barDelta ?? b?.delta ?? 0, cumDelta: b?.cumDelta ?? b?.cumulativeDelta ?? 0 }))
      : [];
  return {
    bars,
    sessionDelta: Number(cvd?.sessionDelta ?? cvd?.cumDelta ?? 0),
    source: String(cvd?.source || 'unknown'),
    fallback: Boolean(cvd?.fallback ?? FALLBACK_SOURCES.has(String(cvd?.source))),
    sessionResetAt: cvd?.sessionResetAt || null,
  };
}

// ── In-flight request guard ───────────────────────────────────────────────────
let _cvdAbort = null;

// ── Store ─────────────────────────────────────────────────────────────────────
export const useCVDStore = create((set, get) => ({
  symbol:         useActiveSymbolStore.getState().symbol,
  bars:           [],        // [{timestamp, delta, cumDelta}]
  sessionDelta:   0,
  source:         'unknown',
  fallback:       false,
  sessionResetAt: null,
  loading:        false,
  error:          '',
  lastUpdated:    null,
  liveUpdate:     false,     // true when the last update came from WS

  // ── API load ──────────────────────────────────────────────────────────────
  abortCVDRequest: () => {
    if (_cvdAbort) {
      _cvdAbort.abort();
      _cvdAbort = null;
    }
    set({ loading: false });
  },

  loadCVD: async () => {
    const symbol = useActiveSymbolStore.getState().symbol;
    if (_cvdAbort) _cvdAbort.abort();
    _cvdAbort = new AbortController();
    const { signal } = _cvdAbort;
    set({ loading: true, error: '', liveUpdate: false });
    try {
      const payload = await api.getChartCVD(symbol, { signal });
      if (signal.aborted) { set({ loading: false }); return; }
      if (useActiveSymbolStore.getState().symbol !== symbol) { set({ loading: false }); return; }
      const { bars, sessionDelta, source, fallback, sessionResetAt } = normalizeCVD(payload);
      set({ bars, sessionDelta, source, fallback, sessionResetAt, loading: false, lastUpdated: new Date().toISOString() });
    } catch (err) {
      if (signal.aborted) { set({ loading: false }); return; }
      // If the backend doesn't have CVD data yet, store a graceful empty state.
      set({ loading: false, error: err?.message || 'Failed to load CVD', bars: [], sessionDelta: 0, fallback: true, source: 'unknown' });
    }
  },

  // ── WS push handler ───────────────────────────────────────────────────────
  handleWsMessage: (msg) => {
    if (msg?.type !== 'cumulative_delta') return;
    const msgSymbol = String(msg?.symbol || '').toUpperCase();
    const activeSymbol = useActiveSymbolStore.getState().symbol;
    if (msgSymbol && msgSymbol !== activeSymbol) return; // ignore other symbols
    const { bars, sessionDelta, source, fallback, sessionResetAt } = normalizeCVD(msg);
    set({ bars, sessionDelta, source, fallback, sessionResetAt, liveUpdate: true, lastUpdated: new Date().toISOString() });
  },

  // ── Symbol change ─────────────────────────────────────────────────────────
  setSymbol: (raw) => {
    const next = String(raw || '').trim().toUpperCase();
    if (!next || next === get().symbol) return;
    // Unsubscribe old channel, subscribe new
    wsClient.unsubscribe(`cvd:${get().symbol}`);
    wsClient.subscribe(`cvd:${next}`);
    set({ symbol: next, bars: [], sessionDelta: 0, source: 'unknown', fallback: false, error: '', liveUpdate: false });
    get().loadCVD();
  },

  clearError: () => set({ error: '' }),
}));

// ── Module-level WS subscription ─────────────────────────────────────────────
// Register message handler once — never duplicated across HMR reloads because
// the module is only evaluated once per page load in production.
wsClient.onMessage((msg) => {
  useCVDStore.getState().handleWsMessage(msg);
});

// Subscribe to the CVD channel for the initial symbol on connect/reconnect.
wsClient.onConnect(() => {
  const symbol = useActiveSymbolStore.getState().symbol;
  wsClient.subscribe(`cvd:${symbol}`);
});

// Keep cvdStore.symbol in sync when activeSymbolStore changes (e.g. watchlist click).
useActiveSymbolStore.subscribe((state) => {
  if (useCVDStore.getState().symbol !== state.symbol) {
    useCVDStore.getState().setSymbol(state.symbol);
  }
});
