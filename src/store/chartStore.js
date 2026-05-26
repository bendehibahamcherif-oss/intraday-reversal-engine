import { create } from 'zustand';
import { api } from '../api.js';

const DEFAULT_SYMBOL = 'SPY';
const DEFAULT_TIMEFRAME = '1m';
const DEFAULT_LIMIT = 200;

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
      set({
        candles: payload?.candles || [],
        indicators: payload?.indicators || {},
        overlays: payload?.overlays || [],
        orderflow: payload?.orderflow || null,
        source: payload?.source || '',
        warnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
        loading: false,
        error: '',
        lastUpdated: new Date().toISOString(),
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
