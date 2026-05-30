import { create } from 'zustand';
import { api } from '../api.js';

const toList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.labels)) return payload.labels;
  if (Array.isArray(payload?.models)) return payload.models;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

const errMsg = (err) => err?.message || 'AI Lab request failed';

export const useAILabStore = create((set, get) => ({
  // ── Existing state ────────────────────────────────────────────────────────
  symbol:               'SPY',
  horizon:              10,
  limit:                50,
  featureRecords:       [],
  selectedFeatureRecord: null,
  outcomeLabels:        [],
  currentRegime:        null,
  datasetAnalytics:     null,
  featureAnalytics:     null,
  regimeAnalytics:      null,
  loading:              false,
  analyticsLoading:     false,
  error:                '',
  analyticsError:       '',
  lastUpdated:          null,

  // ── Phase 9: Training ─────────────────────────────────────────────────────
  trainConfig: { modelType: 'xgboost', nEstimators: 200, maxDepth: 5, learningRate: 0.1 },
  trainingJob:     null,
  trainLoading:    false,
  trainError:      '',

  // ── Phase 9: Model Registry ───────────────────────────────────────────────
  modelRegistry:    [],
  registryLoading:  false,
  registryError:    '',

  // ── Phase 9: Champion Model ───────────────────────────────────────────────
  championModel:    null,
  championLoading:  false,
  championError:    '',

  // ── Phase 9: Inference ────────────────────────────────────────────────────
  inferenceResult:  null,
  inferenceLoading: false,
  inferenceError:   '',

  // ── Phase 9: Drift ────────────────────────────────────────────────────────
  driftReport:  null,
  driftLoading: false,
  driftError:   '',

  // ── Phase 9: Feature Importance ───────────────────────────────────────────
  featureImportance:  null,
  importanceModelId:  null,
  importanceLoading:  false,
  importanceError:    '',

  // ── Phase 9: Champion/Challenger ──────────────────────────────────────────
  selectedChallengerModelId: null,
  comparisonResult:          null,
  comparisonLoading:         false,
  comparisonError:           '',

  // ── Setters ───────────────────────────────────────────────────────────────
  setSymbol:    (symbol) => set({ symbol: (symbol || '').trim().toUpperCase() || 'SPY' }),
  setHorizon:   (horizon) => set({ horizon: Number(horizon) || 10 }),
  setLimit:     (limit) => set({ limit: Number(limit) || 50 }),
  clearError:   () => set({ error: '', analyticsError: '', trainError: '', registryError: '', championError: '', inferenceError: '', driftError: '', importanceError: '', comparisonError: '' }),
  setTrainConfig: (cfg) => set((s) => ({ trainConfig: { ...s.trainConfig, ...cfg } })),
  setSelectedChallengerModelId: (id) => set({ selectedChallengerModelId: id || null }),

  // ── Existing actions ──────────────────────────────────────────────────────
  loadCurrentRegime: async () => {
    const { symbol } = get();
    set({ analyticsLoading: true, analyticsError: '' });
    try {
      const payload = await api.getCurrentRegime(symbol);
      set({ currentRegime: payload?.data || payload, analyticsLoading: false, lastUpdated: new Date().toISOString() });
    } catch (err) {
      set({ analyticsLoading: false, analyticsError: errMsg(err), currentRegime: null });
    }
  },

  analyzeDataset: async () => {
    const { symbol } = get();
    set({ analyticsLoading: true, analyticsError: '' });
    try {
      const payload = await api.analyzeDatasetAnalytics(symbol);
      set({ datasetAnalytics: payload?.data || payload, analyticsLoading: false, lastUpdated: new Date().toISOString() });
      await Promise.all([get().loadFeatureAnalytics(), get().loadRegimeAnalytics(), get().loadCurrentRegime()]);
    } catch (err) {
      set({ analyticsLoading: false, analyticsError: errMsg(err) });
    }
  },

  loadDatasetAnalytics: async () => {
    const { symbol } = get();
    set({ analyticsLoading: true, analyticsError: '' });
    try {
      const payload = await api.getDatasetAnalytics(symbol);
      set({ datasetAnalytics: payload?.data || payload, analyticsLoading: false, lastUpdated: new Date().toISOString() });
    } catch (err) {
      set({ analyticsLoading: false, analyticsError: errMsg(err), datasetAnalytics: null });
    }
  },

  loadFeatureAnalytics: async () => {
    const { symbol } = get();
    set({ analyticsLoading: true, analyticsError: '' });
    try {
      const payload = await api.getFeatureAnalytics(symbol);
      set({ featureAnalytics: payload?.data || payload, analyticsLoading: false, lastUpdated: new Date().toISOString() });
    } catch (err) {
      set({ analyticsLoading: false, analyticsError: errMsg(err), featureAnalytics: null });
    }
  },

  loadRegimeAnalytics: async () => {
    const { symbol } = get();
    set({ analyticsLoading: true, analyticsError: '' });
    try {
      const payload = await api.getRegimeAnalytics(symbol);
      set({ regimeAnalytics: payload?.data || payload, analyticsLoading: false, lastUpdated: new Date().toISOString() });
    } catch (err) {
      set({ analyticsLoading: false, analyticsError: errMsg(err), regimeAnalytics: null });
    }
  },

  clearDatasetAnalytics: async () => {
    const { symbol } = get();
    set({ analyticsLoading: true, analyticsError: '' });
    try {
      await api.clearDatasetAnalytics(symbol);
      set({ datasetAnalytics: null, featureAnalytics: null, regimeAnalytics: null, currentRegime: null, analyticsLoading: false, lastUpdated: new Date().toISOString() });
    } catch (err) {
      set({ analyticsLoading: false, analyticsError: errMsg(err) });
    }
  },

  saveFeatureRecord: async () => {
    const { symbol } = get();
    set({ loading: true, error: '' });
    try { await api.saveFeatureRecord(symbol); await get().refreshAll(); }
    catch (err) { set({ loading: false, error: errMsg(err) }); }
  },

  loadFeatureRecords: async () => {
    const { symbol, limit } = get();
    set({ loading: true, error: '' });
    try {
      const payload = await api.getFeatureRecords(symbol, limit);
      const featureRecords = toList(payload);
      const selectedId = get().selectedFeatureRecord?.id || get().selectedFeatureRecord?._id;
      const selectedFeatureRecord = selectedId
        ? featureRecords.find((item) => String(item?.id || item?._id) === String(selectedId)) || null
        : featureRecords[0] || null;
      set({ featureRecords, selectedFeatureRecord, loading: false, lastUpdated: new Date().toISOString() });
    } catch (err) { set({ loading: false, error: errMsg(err), featureRecords: [] }); }
  },

  selectFeatureRecord: async (id) => {
    if (!id) return;
    set({ loading: true, error: '' });
    try {
      const payload = await api.getFeatureRecord(id);
      set({ selectedFeatureRecord: payload?.record || payload?.data || payload, loading: false, lastUpdated: new Date().toISOString() });
    } catch (err) { set({ loading: false, error: errMsg(err) }); }
  },

  clearFeatureRecords: async () => {
    const { symbol } = get();
    set({ loading: true, error: '' });
    try {
      await api.clearFeatureRecords(symbol);
      set({ featureRecords: [], selectedFeatureRecord: null, loading: false, lastUpdated: new Date().toISOString() });
    } catch (err) { set({ loading: false, error: errMsg(err) }); }
  },

  labelSelectedRecord: async () => {
    const { selectedFeatureRecord, horizon } = get();
    const id = selectedFeatureRecord?.id || selectedFeatureRecord?._id;
    if (!id) return set({ error: 'Select a feature record first.' });
    set({ loading: true, error: '' });
    try { await api.labelFeatureRecord(id, horizon); await get().loadOutcomeLabels(); }
    catch (err) { set({ loading: false, error: errMsg(err) }); }
  },

  labelSymbolHistory: async () => {
    const { symbol, horizon, limit } = get();
    set({ loading: true, error: '' });
    try { await api.labelSymbolHistory(symbol, horizon, limit); await get().loadOutcomeLabels(); }
    catch (err) { set({ loading: false, error: errMsg(err) }); }
  },

  loadOutcomeLabels: async () => {
    const { symbol, limit } = get();
    set({ loading: true, error: '' });
    try {
      set({ outcomeLabels: toList(await api.getOutcomeLabels(symbol, limit)), loading: false, lastUpdated: new Date().toISOString() });
    } catch (err) { set({ loading: false, error: errMsg(err), outcomeLabels: [] }); }
  },

  clearOutcomeLabels: async () => {
    const { symbol } = get();
    set({ loading: true, error: '' });
    try {
      await api.clearOutcomeLabels(symbol);
      set({ outcomeLabels: [], loading: false, lastUpdated: new Date().toISOString() });
    } catch (err) { set({ loading: false, error: errMsg(err) }); }
  },

  // ── Phase 9 actions ───────────────────────────────────────────────────────
  trainModel: async () => {
    const { symbol, horizon, limit, trainConfig } = get();
    set({ trainLoading: true, trainError: '', trainingJob: null });
    try {
      const payload = await api.trainMLModel(symbol, {
        horizon, limit,
        modelType:     trainConfig.modelType,
        nEstimators:   trainConfig.nEstimators,
        maxDepth:      trainConfig.maxDepth,
        learningRate:  trainConfig.learningRate,
      });
      set({ trainLoading: false, trainingJob: payload?.job ?? payload?.result ?? payload ?? {}, lastUpdated: new Date().toISOString() });
      await get().loadModelRegistry();
    } catch (err) {
      set({ trainLoading: false, trainError: errMsg(err) });
    }
  },

  loadModelRegistry: async () => {
    const { symbol } = get();
    set({ registryLoading: true, registryError: '' });
    try {
      const payload = await api.getMLModelRegistry(symbol);
      set({ modelRegistry: toList(payload?.models ?? payload?.registry ?? payload), registryLoading: false });
    } catch (err) {
      set({ registryLoading: false, registryError: errMsg(err), modelRegistry: [] });
    }
  },

  loadChampionModel: async () => {
    const { symbol } = get();
    set({ championLoading: true, championError: '' });
    try {
      const payload = await api.getChampionModel(symbol);
      set({ championModel: payload?.model ?? payload?.champion ?? payload ?? null, championLoading: false });
    } catch (err) {
      set({ championLoading: false, championError: errMsg(err), championModel: null });
    }
  },

  promoteToChampion: async (modelId) => {
    if (!modelId) return;
    set({ championLoading: true, championError: '' });
    try {
      await api.setChampionModel(modelId);
      await Promise.all([get().loadChampionModel(), get().loadModelRegistry()]);
    } catch (err) {
      set({ championLoading: false, championError: errMsg(err) });
    }
  },

  runInference: async () => {
    const { symbol, horizon } = get();
    set({ inferenceLoading: true, inferenceError: '' });
    try {
      const payload = await api.runMLInference(symbol, { horizon });
      set({ inferenceResult: payload?.inference ?? payload?.result ?? payload ?? null, inferenceLoading: false, lastUpdated: new Date().toISOString() });
    } catch (err) {
      set({ inferenceLoading: false, inferenceError: errMsg(err) });
    }
  },

  loadDriftReport: async (modelId) => {
    const { symbol } = get();
    set({ driftLoading: true, driftError: '' });
    try {
      const payload = await api.getMLDrift(symbol, modelId);
      set({ driftReport: payload?.drift ?? payload?.report ?? payload ?? null, driftLoading: false });
    } catch (err) {
      set({ driftLoading: false, driftError: errMsg(err) });
    }
  },

  loadFeatureImportance: async (modelId) => {
    if (!modelId) return;
    set({ importanceLoading: true, importanceError: '', importanceModelId: modelId });
    try {
      const payload = await api.getMLFeatureImportance(modelId);
      set({ featureImportance: payload?.importance ?? payload ?? null, importanceLoading: false });
    } catch (err) {
      set({ importanceLoading: false, importanceError: errMsg(err) });
    }
  },

  compareWithChampion: async (challengerId) => {
    const { championModel } = get();
    const championId = championModel?.modelId || championModel?.id;
    if (!championId || !challengerId) return;
    set({ comparisonLoading: true, comparisonError: '' });
    try {
      const payload = await api.compareMLModels(championId, challengerId);
      set({ comparisonResult: payload?.comparison ?? payload?.result ?? payload ?? null, comparisonLoading: false });
    } catch (err) {
      set({ comparisonLoading: false, comparisonError: errMsg(err) });
    }
  },

  refreshAll: async () => {
    await Promise.all([
      get().loadFeatureRecords(),
      get().loadOutcomeLabels(),
      get().loadCurrentRegime(),
      get().loadDatasetAnalytics(),
      get().loadFeatureAnalytics(),
      get().loadRegimeAnalytics(),
      get().loadModelRegistry(),
      get().loadChampionModel(),
    ]);
  },
}));
