import { create } from 'zustand';
import { api } from '../api.js';

function normalizeListPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.signals)) return payload.signals;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function normalizeHistoryPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.snapshots)) return payload.snapshots;
  if (Array.isArray(payload?.history)) return payload.history;
  if (Array.isArray(payload?.data)) return payload.data;
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
  analyticsTrend: [],
  latestAnalytics: null,
  snapshotComparison: null,
  selectedBaseSnapshotId: '',
  selectedCompareSnapshotId: '',
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
      set({ analysisHistory: normalizeHistoryPayload(payload) });
    } catch (err) {
      set({ error: normalizeError(err), analysisHistory: [] });
    }
  },

  setSelectedBaseSnapshotId: (id) => set({ selectedBaseSnapshotId: id || '' }),
  setSelectedCompareSnapshotId: (id) => set({ selectedCompareSnapshotId: id || '' }),

  loadAnalytics: async (limit = 20) => {
    const symbol = get().symbol;
    try {
      const [trendPayload, latestPayload] = await Promise.all([
        api.getAnalyticsTrend(symbol, limit),
        api.getLatestAnalytics(symbol).catch(() => null),
      ]);
      set({
        analyticsTrend: normalizeListPayload(trendPayload),
        latestAnalytics: latestPayload?.data || latestPayload?.latest || latestPayload || null,
      });
    } catch (err) {
      set({
        analyticsTrend: [],
        latestAnalytics: null,
        snapshotComparison: null,
        error: normalizeError(err),
      });
    }
  },

  compareSelectedSnapshots: async () => {
    const { symbol, selectedBaseSnapshotId, selectedCompareSnapshotId } = get();
    if (!selectedBaseSnapshotId || !selectedCompareSnapshotId) {
      set({ error: 'Select both base and comparison snapshots before comparing.', snapshotComparison: null });
      return;
    }

    set({ loading: true, error: '' });
    try {
      const payload = await api.compareSnapshots(symbol, selectedBaseSnapshotId, selectedCompareSnapshotId);
      set({
        snapshotComparison: payload?.comparison || payload?.data || payload || null,
        loading: false,
        lastUpdated: new Date().toISOString(),
      });
    } catch (err) {
      set({ loading: false, error: normalizeError(err), snapshotComparison: null });
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
      set({
        analysisHistory: [],
        analyticsTrend: [],
        latestAnalytics: null,
        snapshotComparison: null,
        selectedSnapshot: null,
        selectedBaseSnapshotId: '',
        selectedCompareSnapshotId: '',
        snapshotId: '',
        loading: false,
      });
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
      await get().loadAnalytics();
    } catch (err) {
      set({ loading: false, error: normalizeError(err) });
    }
  },

  analyzeAll: async () => {
    const { symbol, timeframe } = get();
    set({ loading: true, error: '' });

    try {
      const pipeline = await api.runQuantPipeline(symbol, timeframe);
      const nextSnapshotId = pipeline?.snapshotId || pipeline?.snapshot?.id || pipeline?.snapshot?._id || pipeline?.data?.snapshotId || '';
      const pipelineWarnings = normalizeListPayload(pipeline?.warnings);
      const warningsWithSnapshotStatus = nextSnapshotId
        ? pipelineWarnings
        : [...pipelineWarnings, 'Analysis completed but no snapshot was saved.'];

      set({
        alphaSignals: normalizeListPayload(pipeline?.alphaSignals),
        patternSignals: normalizeListPayload(pipeline?.patternSignals),
        strategyCandidates: normalizeListPayload(pipeline?.strategyCandidates),
        quantFeatures: normalizeListPayload(pipeline?.quantFeatures),
        qualityScores: normalizeListPayload(pipeline?.qualityScores),
        rankedSignals: normalizeListPayload(pipeline?.rankedSignals),
        warnings: warningsWithSnapshotStatus,
        snapshotId: nextSnapshotId,
        selectedSnapshot: null,
        snapshotComparison: null,
        analyzedAt: pipeline?.analyzedAt || null,
        loading: false,
        lastUpdated: new Date().toISOString(),
      });
      await get().loadHistory();
      await get().loadAnalytics();
    } catch (err) {
      set({ loading: false, error: normalizeError(err) });
    }
  },
}));
