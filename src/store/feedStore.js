import { create } from 'zustand';
import { api } from '../api.js';

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
};

function normalizeError(error) {
  return error?.message || 'Unable to load feed data.';
}

export const useFeedStore = create((set, get) => ({
  ...initialState,

  setSymbol: (symbol) => set({ symbol: String(symbol || '').toUpperCase() || 'SPY' }),
  setTimeframe: (timeframe) => set({ timeframe: timeframe || '1m' }),

  clearError: () => set({ error: '' }),

  loadFeedStatus: async () => {
    set({ loading: true, error: '' });
    try {
      const feedStatus = await api.getFeedStatus();
      set({ feedStatus, loading: false, lastUpdated: new Date().toISOString() });
      return feedStatus;
    } catch (error) {
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
      set({ loading: false, error: normalizeError(error) });
      return false;
    }
  },

  refreshAll: async () => {
    set({ loading: true, error: '' });
    try {
      await Promise.all([get().loadFeedStatus(), get().loadLatestMarketData()]);
      set({ loading: false, lastUpdated: new Date().toISOString() });
    } catch (error) {
      set({ loading: false, error: normalizeError(error) });
    }
  },
}));
