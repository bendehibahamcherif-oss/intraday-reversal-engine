import { create } from 'zustand';
import { api } from '../api.js';
import { useFeedStore } from './feedStore.js';
import { useActiveSymbolStore } from './activeSymbolStore.js';

const DEFAULT_TIMEFRAME = '1m';
const DEFAULT_LIMIT = 200;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeCandles(rawCandles = []) {
  return asArray(rawCandles)
    .map((candle) => {
      const rawTimestamp = candle?.timestamp ?? candle?.time ?? candle?.t ?? null;
      const timestamp = rawTimestamp === null || rawTimestamp === undefined || rawTimestamp === ''
        ? null
        : rawTimestamp;
      return {
        ...candle,
        time: timestamp,
        timestamp,
        open: Number(candle?.open ?? candle?.o),
        high: Number(candle?.high ?? candle?.h),
        low: Number(candle?.low ?? candle?.l),
        close: Number(candle?.close ?? candle?.c),
        volume: Number(candle?.volume ?? candle?.v ?? 0),
      };
    })
    .filter((c) => c.timestamp !== null && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));
}

// Module-level AbortController — one active fetch at a time.
let _chartAbort = null;

export const useChartStore = create((set, get) => ({
  // Mirror of activeSymbolStore.symbol — kept for workspace UI backward compat.
  symbol: useActiveSymbolStore.getState().symbol,
  timeframe: DEFAULT_TIMEFRAME,
  limit: DEFAULT_LIMIT,
  candles: [],
  indicators: {},
  overlays: [],
  orderflow: null,
  source: '',
  warnings: [],
  loading: false,
  error: '',
  lastUpdated: null,

  // setSymbol delegates to activeSymbolStore (single owner) and clears stale candles.
  setSymbol: (raw) => {
    const next = normalizeSymbol(raw) || useActiveSymbolStore.getState().symbol;
    if (next === get().symbol) return;
    useActiveSymbolStore.getState().setSymbol(next);
    set({ symbol: next, candles: [], loading: false });
  },
  setTimeframe: (timeframe) => set({ timeframe: timeframe || DEFAULT_TIMEFRAME }),
  setLimit: (limit) => set({ limit: Number(limit) > 0 ? Number(limit) : DEFAULT_LIMIT }),
  clearError: () => set({ error: '' }),
  abortChartRequest: () => {
    if (_chartAbort) {
      _chartAbort.abort();
      _chartAbort = null;
    }
    set({ loading: false });
  },

  loadChartPayload: async () => {
    // Cancel any in-flight request before starting a new one.
    if (_chartAbort) {
      _chartAbort.abort();
      console.debug('[chartStore] previous request aborted (symbol/refresh)');
    }
    _chartAbort = new AbortController();

    // Always read symbol from the single source of truth.
    const symbol = useActiveSymbolStore.getState().symbol;
    const { timeframe, limit } = get();

    // Sync mirror and clear stale candles immediately so UI never shows wrong symbol's data.
    set({ symbol, candles: [], loading: true, error: '' });
    console.debug('[chartStore] loading chart', { symbol, timeframe, limit });

    try {
      const payload = await api.getChartPayload(symbol, timeframe, limit, _chartAbort.signal);

      // Post-fetch guard: discard if symbol changed while fetch was in flight.
      const currentSymbol = useActiveSymbolStore.getState().symbol;
      if (currentSymbol !== symbol) {
        console.warn('[chartStore] stale payload ignored', { requested: symbol, current: currentSymbol });
        return;
      }

      const rawReplayPayload = payload?.payload || payload?.data || payload;
      const rawCandles = rawReplayPayload?.candles ?? payload?.candles;
      const normalizedCandles = normalizeCandles(rawCandles);
      const marketSource = String(rawReplayPayload?.source || payload?.source || payload?.provider || 'unknown');

      console.debug('[chartStore] chart hydrated', {
        symbol,
        candles: normalizedCandles.length,
        source: marketSource,
        latestTimestamp: normalizedCandles.length ? normalizedCandles[normalizedCandles.length - 1]?.timestamp : null,
      });

      set({
        candles: normalizedCandles,
        indicators: payload?.indicators || {},
        overlays: payload?.overlays || [],
        orderflow: payload?.orderflow || null,
        source: marketSource,
        warnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
        loading: false,
        error: '',
        lastUpdated: new Date().toISOString(),
      });

      // Hydrate feedStore with latest candle/tick data only — no symbol or runtime mutations.
      useFeedStore.getState().hydrateFromReplayCandles({ candles: normalizedCandles, source: marketSource, symbol, timeframe });
    } catch (err) {
      if (err?.name === 'AbortError') {
        console.debug('[chartStore] request aborted cleanly');
        set({ loading: false });
        return;
      }
      set({ loading: false, error: err?.message || 'Failed to load chart payload' });
    }
  },

  refreshChart: async () => {
    await get().loadChartPayload();
  },

  // Apply a single realtime tick to the last candle in-place.
  // No fetch, no AbortController interaction — pure local mutation.
  applyRealtimeTick: (tick) => {
    const activeSymbol = useActiveSymbolStore.getState().symbol;
    const tickSym = String(tick?.symbol || '').toUpperCase();
    if (!tickSym || tickSym !== activeSymbol) {
      console.debug('[chartStore] realtime tick skipped (symbol mismatch)', { tickSym, activeSymbol });
      return;
    }
    const price = Number(tick?.price);
    if (!Number.isFinite(price)) return;

    set((state) => {
      const candles = state.candles;
      if (!candles.length) return {};
      const last = candles[candles.length - 1];
      const updated = {
        ...last,
        high: Math.max(Number(last.high) || price, price),
        low: Math.min(Number(last.low) || price, price),
        close: price,
        volume: (Number(last.volume) || 0) + (Number(tick.volume) || 0),
      };
      console.debug('[chartStore] realtime tick applied', { symbol: tickSym, price, ts: last.timestamp || last.time });
      return { candles: [...candles.slice(0, -1), updated] };
    });
  },
}));

// Keep chartStore.symbol mirror in sync whenever activeSymbolStore changes.
useActiveSymbolStore.subscribe((state) => {
  if (useChartStore.getState().symbol !== state.symbol) {
    useChartStore.setState({ symbol: state.symbol });
  }
});
