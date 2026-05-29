import { create } from 'zustand';
import { api } from '../api.js';
import wsClient from '../services/wsClient.js';
import { useActiveSymbolStore } from './activeSymbolStore.js';

// ── Source classification ─────────────────────────────────────────────────────
// Imbalances are only valid when source is bid_ask_tick (real T&S data).
// l1_midpoint and ohlcv_synthetic do not provide reliable side-of-book info.
export const FOOTPRINT_SOURCES = {
  bid_ask_tick:   'Bid/Ask Tick',
  l1_midpoint:    'L1 Midpoint Approx',
  ohlcv_synthetic:'OHLCV Synthetic',
};
export const IMBALANCE_CAPABLE_SOURCES = new Set(['bid_ask_tick']);

// ── Normaliser ────────────────────────────────────────────────────────────────
function normalizeBar(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    timestamp:        raw.timestamp || raw.time || null,
    open:             Number(raw.open  ?? raw.o ?? 0),
    high:             Number(raw.high  ?? raw.h ?? 0),
    low:              Number(raw.low   ?? raw.l ?? 0),
    close:            Number(raw.close ?? raw.c ?? 0),
    poc:              raw.poc != null ? Number(raw.poc) : null,
    totalBid:         Number(raw.totalBid  ?? 0),
    totalAsk:         Number(raw.totalAsk  ?? 0),
    delta:            Number(raw.delta     ?? ((raw.totalAsk ?? 0) - (raw.totalBid ?? 0))),
    stackedImbalance: raw.stackedImbalance || null,  // 'ask' | 'bid' | null
    absorption:       Boolean(raw.absorption),
    levels: Array.isArray(raw.levels)
      ? raw.levels.map((l) => ({
          price:          Number(l.price ?? 0),
          bidVol:         Number(l.bidVol  ?? l.bid ?? 0),
          askVol:         Number(l.askVol  ?? l.ask ?? 0),
          totalVol:       Number(l.totalVol ?? ((l.bidVol ?? l.bid ?? 0) + (l.askVol ?? l.ask ?? 0))),
          imbalance:      l.imbalance || null,         // 'ask' | 'bid' | null
          imbalanceRatio: Number(l.imbalanceRatio ?? 0),
          absorption:     Boolean(l.absorption),
        }))
      : [],
  };
}

function normalizePayload(payload) {
  const fp = payload?.footprint || payload?.result || payload || {};
  return {
    bars:               (Array.isArray(fp.bars) ? fp.bars : []).map(normalizeBar).filter(Boolean),
    clusterSize:        Number(fp.clusterSize   ?? 0.25),
    imbalanceThreshold: Number(fp.imbalanceThreshold ?? 1.5),
    source:             String(fp.source || 'unknown'),
    fallback:           Boolean(fp.fallback ?? !IMBALANCE_CAPABLE_SOURCES.has(String(fp.source))),
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useFootprintStore = create((set, get) => ({
  symbol:             useActiveSymbolStore.getState().symbol,
  timeframe:          '1m',

  // Data
  bars:               [],
  source:             'unknown',
  fallback:           false,

  // Settings
  clusterSize:        0.25,
  imbalanceThreshold: 1.5,
  maxBars:            10,
  showImbalances:     true,
  showAbsorption:     true,
  visible:            false,   // panel collapsed by default

  // UI
  loading:            false,
  error:              '',
  lastUpdated:        null,
  liveUpdate:         false,

  // ── Load ────────────────────────────────────────────────────────────────────
  loadFootprint: async () => {
    const { clusterSize, imbalanceThreshold, maxBars, timeframe } = get();
    const symbol = useActiveSymbolStore.getState().symbol;
    set({ loading: true, error: '', liveUpdate: false });
    try {
      const payload = await api.getChartFootprint(symbol, {
        timeframe, limit: maxBars + 5, clusterSize, imbalanceThreshold,
      });
      const { bars, source, fallback, clusterSize: cs, imbalanceThreshold: it } = normalizePayload(payload);
      set({ bars, source, fallback, clusterSize: cs, imbalanceThreshold: it, loading: false, lastUpdated: new Date().toISOString() });
    } catch (err) {
      set({ loading: false, error: err?.message || 'Failed to load footprint', bars: [], fallback: true, source: 'unknown' });
    }
  },

  // ── WS push ──────────────────────────────────────────────────────────────────
  handleWsMessage: (msg) => {
    if (msg?.type !== 'footprint_update') return;
    const msgSym = String(msg?.symbol || '').toUpperCase();
    if (msgSym && msgSym !== useActiveSymbolStore.getState().symbol) return;
    const newBar = normalizeBar(msg?.bar);
    if (!newBar) return;
    set((state) => {
      // Replace last bar if same timestamp, otherwise append
      const bars = [...state.bars];
      const last = bars[bars.length - 1];
      if (last && last.timestamp === newBar.timestamp) bars[bars.length - 1] = newBar;
      else bars.push(newBar);
      return { bars: bars.slice(-(state.maxBars + 5)), liveUpdate: true, lastUpdated: new Date().toISOString() };
    });
  },

  // ── Settings ─────────────────────────────────────────────────────────────────
  setClusterSize: (v) => {
    const val = Number(v);
    if (!Number.isFinite(val) || val <= 0) return;
    set({ clusterSize: val });
  },
  setImbalanceThreshold: (v) => {
    const val = Number(v);
    if (!Number.isFinite(val) || val < 1.0) return;
    set({ imbalanceThreshold: Math.min(val, 10) });
  },
  setMaxBars: (v) => {
    const val = Math.max(1, Math.min(30, Number(v) || 10));
    set({ maxBars: val });
  },
  setTimeframe: (tf) => set({ timeframe: tf || '1m' }),
  toggleImbalances: () => set((s) => ({ showImbalances: !s.showImbalances })),
  toggleAbsorption: () => set((s) => ({ showAbsorption: !s.showAbsorption })),
  toggleVisible: () => set((s) => ({ visible: !s.visible })),
  clearError: () => set({ error: '' }),

  // ── Symbol change ─────────────────────────────────────────────────────────────
  setSymbol: (raw) => {
    const next = String(raw || '').trim().toUpperCase();
    if (!next || next === get().symbol) return;
    wsClient.unsubscribe(`footprint:${get().symbol}`);
    wsClient.subscribe(`footprint:${next}`);
    set({ symbol: next, bars: [], source: 'unknown', fallback: false, error: '', liveUpdate: false });
    if (get().visible) get().loadFootprint();
  },
}));

// ── Module-level WS wiring ────────────────────────────────────────────────────
wsClient.onMessage((msg) => useFootprintStore.getState().handleWsMessage(msg));

wsClient.onConnect(() => {
  const sym = useActiveSymbolStore.getState().symbol;
  wsClient.subscribe(`footprint:${sym}`);
});

useActiveSymbolStore.subscribe((state) => {
  if (useFootprintStore.getState().symbol !== state.symbol) {
    useFootprintStore.getState().setSymbol(state.symbol);
  }
});
