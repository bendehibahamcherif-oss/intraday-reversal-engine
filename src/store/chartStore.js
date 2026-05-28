import { create } from 'zustand';
import { api } from '../api.js';
import { useFeedStore } from './feedStore.js';

const DEFAULT_SYMBOL = 'SPY';
const DEFAULT_TIMEFRAME = '1m';
const DEFAULT_LIMIT = 200;

function asArray(value) {
  return Array.isArray(value) ? value : [];
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

export const useChartStore = create((set, get) => ({
  symbol: DEFAULT_SYMBOL,
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

  setSymbol: (symbol) => set({ symbol: symbol || DEFAULT_SYMBOL }),
  setTimeframe: (timeframe) => set({ timeframe: timeframe || DEFAULT_TIMEFRAME }),
  setLimit: (limit) => set({ limit: Number(limit) > 0 ? Number(limit) : DEFAULT_LIMIT }),
  clearError: () => set({ error: '' }),

  loadChartPayload: async () => {
    const { symbol, timeframe, limit } = get();
    set({ loading: true, error: '' });

    try {
      const payload = await api.getChartPayload(symbol, timeframe, limit);
      const rawReplayPayload = payload?.payload || payload?.data || payload;
      const rawCandles = rawReplayPayload?.candles ?? payload?.candles;
      const normalizedCandles = normalizeCandles(rawCandles);
      const marketSource = String(rawReplayPayload?.source || payload?.source || payload?.provider || 'unknown');
      console.debug('[chartStore] raw replay payload', payload);
      console.debug('[chartStore] normalized replay candles', normalizedCandles.slice(0, 3));
      console.debug('[chartStore] parsed candle count', {
        rawCount: asArray(rawCandles).length,
        parsedCount: normalizedCandles.length,
        source: marketSource,
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
      useFeedStore.getState().hydrateFromReplayCandles({ candles: normalizedCandles, source: marketSource, symbol, timeframe });
      console.debug('[chartStore] chart hydration result', {
        candles: normalizedCandles.length,
        latestTimestamp: normalizedCandles.length ? normalizedCandles[normalizedCandles.length - 1]?.timestamp : null,
        source: marketSource,
      });
    } catch (err) {
      set({
        loading: false,
        error: err?.message || 'Failed to load chart payload',
      });
    }
  },

  refreshChart: async () => {
    await get().loadChartPayload();
  },
}));
