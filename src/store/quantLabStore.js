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
  timeframe: '5m',
  alphaSignals: [],
  patternSignals: [],
  strategyCandidates: [],
  quantFeatures: [],
  qualityScores: [],
  rankedSignals: [],
  warnings: [],
  analysisHistory: [],
  selectedSnapshot: null,
  snapshotId: '',
  loading: false,
  error: '',
  lastUpdated: null,
  analyzedAt: null,

  setSymbol: (symbol) => set({ symbol: symbol?.trim()?.toUpperCase() || 'SPY' }),
  setTimeframe: (timeframe) => set({ timeframe: timeframe || '5m' }),

  clearError: () => set({ error: '' }),

  loadHistory: async (limit = 20) => {
    const symbol = get().symbol;
    try {
      const payload = await api.getAnalysisHistory(symbol, limit);
      set({ analysisHistory: normalizeListPayload(payload) });
    } catch (err) {
      set({ error: normalizeError(err), analysisHistory: [] });
    }
  },

  selectSnapshot: async (id) => {
    if (!id) return;
    set({ loading: true, error: '' });
    try {
      const snapshot = await api.getAnalysisSnapshot(id);
      const data = snapshot?.snapshot || snapshot?.data || snapshot;
      set({
        selectedSnapshot: data,
        snapshotId: data?.id || data?._id || id,
        alphaSignals: normalizeListPayload(data?.alphaSignals),
        patternSignals: normalizeListPayload(data?.patternSignals),
        strategyCandidates: normalizeListPayload(data?.strategyCandidates),
        quantFeatures: normalizeListPayload(data?.quantFeatures),
        qualityScores: normalizeListPayload(data?.qualityScores),
        rankedSignals: normalizeListPayload(data?.rankedSignals),
        warnings: normalizeListPayload(data?.warnings),
        analyzedAt: data?.createdAt || data?.analyzedAt || null,
        loading: false,
        lastUpdated: new Date().toISOString(),
      });
    } catch (err) {
      set({ loading: false, error: normalizeError(err) });
    }
  },

  clearHistory: async () => {
    const symbol = get().symbol;
    set({ loading: true, error: '' });
    try {
      await api.clearAnalysisHistory(symbol);
      set({ analysisHistory: [], selectedSnapshot: null, snapshotId: '', loading: false });
    } catch (err) {
      set({ loading: false, error: normalizeError(err) });
    }
  },

  refreshAll: async () => {
    const symbol = get().symbol;
    set({ loading: true, error: '' });

    try {
      const [alpha, patterns, strategies, features, quality] = await Promise.all([
        api.getAlphaSignals(symbol),
        api.getPatternSignals(symbol),
        api.getStrategyCandidates(symbol),
        api.getQuantFeatures(symbol),
        api.getQualityScores(symbol).catch(() => []),
      ]);

      set({
        alphaSignals: normalizeListPayload(alpha),
        patternSignals: normalizeListPayload(patterns),
        strategyCandidates: normalizeListPayload(strategies),
        quantFeatures: normalizeListPayload(features),
        qualityScores: normalizeListPayload(quality),
        rankedSignals: [],
        loading: false,
        lastUpdated: new Date().toISOString(),
      });
    } catch (err) {
      set({ loading: false, error: normalizeError(err) });
    }
  },

  analyzeAll: async () => {
    const { symbol, timeframe } = get();
    set({ loading: true, error: '' });

    try {
      const pipeline = await api.runQuantPipeline(symbol, timeframe);

      set({
        alphaSignals: normalizeListPayload(pipeline?.alphaSignals),
        patternSignals: normalizeListPayload(pipeline?.patternSignals),
        strategyCandidates: normalizeListPayload(pipeline?.strategyCandidates),
        quantFeatures: normalizeListPayload(pipeline?.quantFeatures),
        qualityScores: normalizeListPayload(pipeline?.qualityScores),
        rankedSignals: normalizeListPayload(pipeline?.rankedSignals),
        warnings: normalizeListPayload(pipeline?.warnings),
        snapshotId: pipeline?.snapshotId || '',
        selectedSnapshot: null,
        analyzedAt: pipeline?.analyzedAt || null,
        loading: false,
        lastUpdated: new Date().toISOString(),
      });
      await get().loadHistory();
    } catch (err) {
      set({ loading: false, error: normalizeError(err) });
    }
  },
}));
