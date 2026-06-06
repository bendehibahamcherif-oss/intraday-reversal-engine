import { create } from 'zustand';
import { api } from '../api.js';
import { getDatasetId, normalizeDataset } from '../utils/datasets.js';

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

function normalizeBacktestResult(payload) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload[0] || null;
  if (payload?.result) return payload.result;
  if (payload?.backtestResult) return payload.backtestResult;
  if (payload?.backtest) return payload.backtest;
  if (Array.isArray(payload?.results)) return payload.results[0] || null;
  if (Array.isArray(payload?.data)) return payload.data[0] || null;
  if (payload?.data) return payload.data;
  return payload;
}

function getBacktestResultId(result) {
  return String(result?.id || result?._id || result?.resultId || result?.backtestId || '');
}
function normalizeValidationResult(payload) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload[0] || null;
  if (payload?.result) return payload.result;
  if (payload?.validationResult) return payload.validationResult;
  if (payload?.validation) return payload.validation;
  if (Array.isArray(payload?.results)) return payload.results[0] || null;
  if (Array.isArray(payload?.data)) return payload.data[0] || null;
  if (payload?.data) return payload.data;
  return payload;
}
function getValidationResultId(result) {
  return String(result?.id || result?._id || result?.resultId || result?.validationId || '');
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
  reversalPoints: [],
  reversalLoading: false,
  reversalError: '',
  reversalStrategy: null,
  reversalStrategyLoading: false,
  reversalStrategyError: '',
  analysisHistory: [],
  analyticsTrend: [],
  latestAnalytics: null,
  snapshotComparison: null,
  selectedBaseSnapshotId: '',
  selectedCompareSnapshotId: '',
  selectedSnapshot: null,
  snapshotId: '',
  backtestResults: [],
  selectedBacktestResult: null,
  backtestLoading: false,
  backtestError: '',
  backtestPendingDatasetId: null,
  selectedBacktestDatasetId: null,
  selectedBacktestDataset: null,
  walkForwardResult: null,
  walkForwardLoading: false,
  walkForwardError: '',
  monteCarloResult: null,
  monteCarloLoading: false,
  monteCarloError: '',
  reportDownloading: false,
  validationResults: [],
  selectedValidationResult: null,
  validationLoading: false,
  validationError: '',
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
        reversalPoints: [],
        reversalError: '',
  reversalStrategy: null,
  reversalStrategyLoading: false,
  reversalStrategyError: '',
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: normalizeError(err) });
    }
  },


  loadBacktestResults: async () => {
    const symbol = get().symbol;
    set({ backtestLoading: true, backtestError: '' });
    try {
      const payload = await api.getBacktestResults(symbol);
      const rawResults = normalizeListPayload(payload);
      const results = rawResults
        .map((item) => normalizeBacktestResult(item))
        .filter(Boolean);
      const currentSelected = get().selectedBacktestResult;
      const selectedId = getBacktestResultId(currentSelected);
      const persistedSelection = selectedId
        ? results.find((item) => getBacktestResultId(item) === selectedId)
        : null;
      set({
        backtestResults: results,
        selectedBacktestResult: persistedSelection || currentSelected || results[0] || null,
        backtestLoading: false,
      });
    } catch (err) {
      set({ backtestLoading: false, backtestError: normalizeError(err), backtestResults: [], selectedBacktestResult: null });
    }
  },

  setBacktestPendingDatasetId: (datasetId, dataset = null) => {
    const id = datasetId || getDatasetId(dataset);
    if (!id) return set({ backtestError: 'Dataset ID missing. Reload dataset registry.' });
    set({ backtestPendingDatasetId: id, selectedBacktestDatasetId: id, selectedBacktestDataset: dataset ? normalizeDataset(dataset) : get().selectedBacktestDataset });
  },
  clearBacktestPendingDatasetId: () => set({ backtestPendingDatasetId: null, selectedBacktestDatasetId: null, selectedBacktestDataset: null }),

  runBacktest: async (strategyId) => {
    const { symbol, timeframe, strategyCandidates, backtestPendingDatasetId } = get();
    if (!strategyId) {
      set({ backtestError: 'No strategy selected for backtest.' });
      return;
    }

    const selectedStrategy = strategyCandidates.find((item) => {
      const id = item?.id || item?._id || item?.strategyId || item?.name;
      return String(id) === String(strategyId);
    });

    if (!selectedStrategy) {
      set({ backtestError: 'Selected strategy is unavailable.' });
      return;
    }

    set({ backtestLoading: true, backtestError: '' });
    try {
      const payload = await api.runBacktest(symbol, strategyId, timeframe, backtestPendingDatasetId);
      const result = normalizeBacktestResult(payload);
      if (!result) {
        set({
          backtestLoading: false,
          backtestError: 'Backtest completed but the backend returned no result payload.',
        });
        return;
      }

      const resultId = getBacktestResultId(result);
      const nextResults = [
        result,
        ...get().backtestResults.filter((item) => getBacktestResultId(item) !== resultId),
      ];
      set({
        backtestResults: nextResults,
        selectedBacktestResult: result,
        backtestLoading: false,
      });

      await get().loadBacktestResults();
    } catch (err) {
      set({ backtestLoading: false, backtestError: normalizeError(err) });
    }
  },

  selectBacktestResult: async (id) => {
    const symbol = get().symbol;
    if (!id) {
      set({ selectedBacktestResult: null });
      return;
    }

    set({ backtestLoading: true, backtestError: '' });
    try {
      const payload = await api.getBacktestResult(symbol, id);
      set({ selectedBacktestResult: normalizeBacktestResult(payload), backtestLoading: false });
    } catch (err) {
      set({ backtestLoading: false, backtestError: normalizeError(err) });
    }
  },

  clearBacktestResults: async () => {
    const symbol = get().symbol;
    set({ backtestLoading: true, backtestError: '' });
    try {
      await api.clearBacktestResults(symbol);
      set({ backtestResults: [], selectedBacktestResult: null, backtestLoading: false });
    } catch (err) {
      set({ backtestLoading: false, backtestError: normalizeError(err) });
    }
  },

  runWalkForward: async (strategyId, config = {}) => {
    const { symbol, timeframe } = get();
    if (!strategyId) { set({ walkForwardError: 'Select a strategy before running walk-forward.' }); return; }
    set({ walkForwardLoading: true, walkForwardError: '' });
    try {
      const payload = await api.runWalkForwardBacktest(symbol, { strategyId, timeframe, ...config });
      set({ walkForwardResult: payload?.result || payload, walkForwardLoading: false });
    } catch (err) {
      set({ walkForwardLoading: false, walkForwardError: normalizeError(err) });
    }
  },

  runMonteCarlo: async (strategyId, config = {}) => {
    const { symbol, timeframe, selectedBacktestResult } = get();
    const id = strategyId || selectedBacktestResult?.strategyId || '';
    if (!id) { set({ monteCarloError: 'No strategy available for Monte Carlo simulation.' }); return; }
    set({ monteCarloLoading: true, monteCarloError: '' });
    try {
      const payload = await api.runMonteCarloBacktest(symbol, { strategyId: id, timeframe, ...config });
      set({ monteCarloResult: payload?.result || payload, monteCarloLoading: false });
    } catch (err) {
      set({ monteCarloLoading: false, monteCarloError: normalizeError(err) });
    }
  },

  downloadReport: async (id) => {
    const { symbol } = get();
    if (!id) { set({ backtestError: 'No result selected for export.' }); return; }
    set({ reportDownloading: true });
    try {
      const html = await api.getBacktestReport(symbol, id);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      set({ reportDownloading: false });
    } catch (err) {
      set({ reportDownloading: false, backtestError: normalizeError(err) });
    }
  },
  loadValidationResults: async () => {
    const symbol = get().symbol;
    set({ validationLoading: true, validationError: '' });
    try {
      const payload = await api.getValidationResults(symbol);
      const rawResults = normalizeListPayload(payload);
      const results = rawResults.map((item) => normalizeValidationResult(item)).filter(Boolean);
      const currentSelected = get().selectedValidationResult;
      const selectedId = getValidationResultId(currentSelected);
      const persistedSelection = selectedId ? results.find((item) => getValidationResultId(item) === selectedId) : null;
      set({
        validationResults: results,
        selectedValidationResult: persistedSelection || currentSelected || results[0] || null,
        validationLoading: false,
      });
    } catch (err) {
      set({ validationLoading: false, validationError: normalizeError(err), validationResults: [], selectedValidationResult: null });
    }
  },
  validateStrategy: async (strategyId) => {
    const { symbol, strategyCandidates } = get();
    if (!strategyId) {
      set({ validationError: 'No strategy selected for validation.' });
      return;
    }
    const selectedStrategy = strategyCandidates.find((item) => String(item?.id || item?._id || item?.strategyId || item?.name) === String(strategyId));
    if (!selectedStrategy) {
      set({ validationError: 'Selected strategy is unavailable.' });
      return;
    }
    set({ validationLoading: true, validationError: '' });
    try {
      const payload = await api.validateStrategy(symbol, strategyId);
      const result = normalizeValidationResult(payload);
      if (!result) {
        set({ validationLoading: false, validationError: 'Validation completed but the backend returned no result payload.' });
        return;
      }
      const resultId = getValidationResultId(result);
      const nextResults = [result, ...get().validationResults.filter((item) => getValidationResultId(item) !== resultId)];
      set({ validationResults: nextResults, selectedValidationResult: result, validationLoading: false });
      await get().loadValidationResults();
    } catch (err) {
      set({ validationLoading: false, validationError: normalizeError(err) });
    }
  },
  selectValidationResult: async (id) => {
    const symbol = get().symbol;
    if (!id) {
      set({ selectedValidationResult: null });
      return;
    }
    set({ validationLoading: true, validationError: '' });
    try {
      const payload = await api.getValidationResult(symbol, id);
      set({ selectedValidationResult: normalizeValidationResult(payload), validationLoading: false });
    } catch (err) {
      set({ validationLoading: false, validationError: normalizeError(err) });
    }
  },

  loadReversalPoints: async () => {
    const symbol = get().symbol;
    set({ reversalLoading: true, reversalError: '' });
    try {
      const payload = await api.getReversalPoints(symbol);
      set({ reversalPoints: normalizeListPayload(payload), reversalLoading: false });
    } catch (err) {
      set({ reversalLoading: false, reversalError: normalizeError(err), reversalPoints: [] });
    }
  },

  detectReversals: async () => {
    const { symbol, timeframe } = get();
    set({ reversalLoading: true, reversalError: '' });
    try {
      const payload = await api.detectReversalPoints(symbol, timeframe);
      set({ reversalPoints: normalizeListPayload(payload), reversalLoading: false, lastUpdated: new Date().toISOString() });
    } catch (err) {
      set({ reversalLoading: false, reversalError: normalizeError(err) });
    }
  },

  clearReversalPoints: async () => {
    const symbol = get().symbol;
    set({ reversalLoading: true, reversalError: '' });
    try {
      await api.clearReversalPoints(symbol);
      set({ reversalPoints: [], reversalLoading: false, reversalStrategy: null, reversalStrategyError: '' });
    } catch (err) {
      set({ reversalLoading: false, reversalError: normalizeError(err) });
    }
  },

  createStrategyFromReversal: async (reversalPointId) => {
    const { symbol, reversalPoints } = get();
    if (!reversalPointId) {
      set({ reversalStrategyError: 'No reversal point selected.' });
      return;
    }

    set({ reversalStrategyLoading: true, reversalStrategyError: '' });
    try {
      const payload = await api.createStrategyFromReversal(symbol, reversalPointId);
      const strategy = payload?.strategy || payload?.data || payload || null;
      if (!strategy) {
        set({ reversalStrategyLoading: false, reversalStrategyError: 'Strategy creation completed but no strategy was returned.' });
        return;
      }

      const hydratedReversalPoints = reversalPoints.map((point) => {
        const pointId = String(point?.id || point?._id || point?.reversalPointId || '');
        return pointId === String(reversalPointId) ? { ...point, generatedStrategy: strategy } : point;
      });

      set({
        reversalPoints: hydratedReversalPoints,
        reversalStrategy: strategy,
        reversalStrategyLoading: false,
      });
    } catch (err) {
      set({ reversalStrategyLoading: false, reversalStrategyError: normalizeError(err) });
    }
  },

  saveStrategyFromReversal: async (reversalPointId) => {
    const { symbol } = get();
    if (!reversalPointId) {
      set({ reversalStrategyError: 'No reversal point selected.' });
      return;
    }

    set({ reversalStrategyLoading: true, reversalStrategyError: '' });
    try {
      const payload = await api.saveStrategyFromReversal(symbol, reversalPointId);
      const saved = payload?.strategy || payload?.savedStrategy || payload?.data || payload || null;
      set({ reversalStrategy: saved, reversalStrategyLoading: false });
    } catch (err) {
      set({ reversalStrategyLoading: false, reversalStrategyError: normalizeError(err) });
    }
  },


  clearValidationResults: async () => {
    const symbol = get().symbol;
    set({ validationLoading: true, validationError: '' });
    try {
      await api.clearValidationResults(symbol);
      set({ validationResults: [], selectedValidationResult: null, validationLoading: false });
    } catch (err) {
      set({ validationLoading: false, validationError: normalizeError(err) });
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
      await Promise.all([get().loadAnalytics(), get().loadBacktestResults(), get().loadValidationResults(), get().loadReversalPoints()]);
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
