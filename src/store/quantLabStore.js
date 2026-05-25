import { create } from 'zustand';
import { api } from '../api.js';

function normalizeListPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.signals)) return payload.signals;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function normalizeError(err) {
  return err?.message || 'Failed to load Quant Lab data';
}

export const useQuantLabStore = create((set, get) => ({
  symbol: 'SPY',
  alphaSignals: [],
  patternSignals: [],
  strategyCandidates: [],
  quantFeatures: [],
  loading: false,
  error: '',
  lastUpdated: null,

  setSymbol: (symbol) => set({ symbol: symbol?.trim()?.toUpperCase() || 'SPY' }),

  clearError: () => set({ error: '' }),

  refreshAll: async () => {
    const symbol = get().symbol;
    set({ loading: true, error: '' });

    try {
      const [alpha, patterns, strategies, features] = await Promise.all([
        api.getAlphaSignals(symbol),
        api.getPatternSignals(symbol),
        api.getStrategyCandidates(symbol),
        api.getQuantFeatures(symbol),
      ]);

      set({
        alphaSignals: normalizeListPayload(alpha),
        patternSignals: normalizeListPayload(patterns),
        strategyCandidates: normalizeListPayload(strategies),
        quantFeatures: normalizeListPayload(features),
        loading: false,
        lastUpdated: new Date().toISOString(),
      });
    } catch (err) {
      set({ loading: false, error: normalizeError(err) });
    }
  },

  analyzeAll: async () => {
    const symbol = get().symbol;
    set({ loading: true, error: '' });

    try {
      await Promise.all([
        api.analyzeAlpha(symbol),
        api.analyzePatterns(symbol),
        api.generateStrategies(symbol),
        api.extractQuantFeatures(symbol),
      ]);

      await get().refreshAll();
    } catch (err) {
      set({ loading: false, error: normalizeError(err) });
    }
  },
}));
