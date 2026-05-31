import { create } from 'zustand';
import { api } from '../api.js';

/**
 * mlStore — comprehensive ML Signal Engine state.
 *
 * Extends mlSignalStore with:
 *   - champion/challenger versions
 *   - healthStatus
 *   - trainingRuns
 *   - predictionHistory
 *   - featureImportance
 *   - driftMetrics
 *   - modelCard
 *   - modelInfo
 */

const initialState = {
  // Signal per symbol
  signalBySymbol:  {},
  signalLoading:   {},
  signalError:     {},

  // Model metadata
  modelInfo:       null,
  modelInfoLoading: false,
  modelInfoError:  '',

  // Health
  healthStatus:    null,
  healthLoading:   false,
  healthError:     '',

  // Training runs
  trainingRuns:    [],
  trainingLoading: false,
  trainingError:   '',
  trainingInProgress: false,
  lastTrainingResult: null,

  // Prediction history
  predictionHistory: [],
  predictionsLoading: false,
  predictionsError: '',

  // Feature importance
  featureImportance: [],
  importanceLoading: false,
  importanceError: '',

  // Drift metrics
  driftMetrics:    null,
  driftLoading:    false,
  driftError:      '',

  // Model card
  modelCard:       null,
  modelCardLoading: false,
  modelCardError:  '',

  // Diagnostics (Phase 9A compat)
  diagnostics:     null,
  diagnosticsLoading: false,
  diagnosticsError: '',

  // Models registry list
  models:          [],
  modelsLoading:   false,
  modelsError:     '',

  lastUpdated:     null,
};

export const useMLStore = create((set, get) => ({
  ...initialState,

  // ── Signal ──────────────────────────────────────────────────────────────────

  /**
   * Load latest signal for a symbol from GET /api/ml/signal/:symbol
   */
  loadSignal: async (symbol, timeframe = '1m') => {
    if (!symbol) return;
    const sym = symbol.toUpperCase();
    set((s) => ({ signalLoading: { ...s.signalLoading, [sym]: true }, signalError: { ...s.signalError, [sym]: '' } }));
    try {
      const data = await api.getMLSignal(sym, timeframe);
      set((s) => ({
        signalBySymbol: { ...s.signalBySymbol, [sym]: data },
        signalLoading:  { ...s.signalLoading,  [sym]: false },
        lastUpdated: new Date().toISOString(),
      }));
    } catch (err) {
      set((s) => ({
        signalLoading: { ...s.signalLoading, [sym]: false },
        signalError:   { ...s.signalError,   [sym]: err.message },
      }));
    }
  },

  /**
   * Run inference via POST /api/ml/infer/:symbol with a feature vector.
   */
  infer: async (symbol, featureVector, timeframe = '1m') => {
    if (!symbol || !featureVector?.length) return;
    const sym = symbol.toUpperCase();
    set((s) => ({ signalLoading: { ...s.signalLoading, [sym]: true } }));
    try {
      const data = await api.mlInfer(sym, { featureVector, timeframe });
      set((s) => ({
        signalBySymbol: { ...s.signalBySymbol, [sym]: data },
        signalLoading:  { ...s.signalLoading,  [sym]: false },
        lastUpdated: new Date().toISOString(),
      }));
      return data;
    } catch (err) {
      set((s) => ({
        signalLoading: { ...s.signalLoading, [sym]: false },
        signalError:   { ...s.signalError,   [sym]: err.message },
      }));
      throw err;
    }
  },

  // ── Health ───────────────────────────────────────────────────────────────────

  fetchHealth: async () => {
    set({ healthLoading: true, healthError: '' });
    try {
      const data = await api.getMLHealth();
      set({ healthStatus: data, healthLoading: false });
    } catch (err) {
      set({ healthLoading: false, healthError: err.message });
    }
  },

  // ── Model info ───────────────────────────────────────────────────────────────

  fetchModelInfo: async () => {
    set({ modelInfoLoading: true, modelInfoError: '' });
    try {
      const data = await api.getMLModelInfo();
      set({ modelInfo: data, modelInfoLoading: false });
    } catch (err) {
      set({ modelInfoLoading: false, modelInfoError: err.message });
    }
  },

  // ── Training ─────────────────────────────────────────────────────────────────

  fetchTrainingRuns: async () => {
    set({ trainingLoading: true, trainingError: '' });
    try {
      const data = await api.getMLModelRuns();
      const runs = Array.isArray(data) ? data : (data.models || []);
      set({ trainingRuns: runs, trainingLoading: false });
    } catch (err) {
      set({ trainingLoading: false, trainingError: err.message });
    }
  },

  startTraining: async (opts = {}) => {
    set({ trainingInProgress: true, trainingError: '' });
    try {
      const data = await api.trainMLModelP1(opts);
      set({ trainingInProgress: false, lastTrainingResult: data });
      // Refresh runs after training
      get().fetchTrainingRuns();
      return data;
    } catch (err) {
      set({ trainingInProgress: false, trainingError: err.message });
      throw err;
    }
  },

  promoteModel: async (modelVersion) => {
    try {
      const data = await api.promoteMLModel(modelVersion);
      await get().fetchModelInfo();
      await get().fetchTrainingRuns();
      return data;
    } catch (err) {
      set({ modelsError: err.message });
      throw err;
    }
  },

  // ── Prediction history ────────────────────────────────────────────────────────

  fetchPredictionHistory: async () => {
    set({ predictionsLoading: true, predictionsError: '' });
    try {
      const data = await api.getMLPredictions();
      const preds = Array.isArray(data) ? data : (data.predictions || []);
      set({ predictionHistory: preds, predictionsLoading: false });
    } catch (err) {
      set({ predictionsLoading: false, predictionsError: err.message });
    }
  },

  // ── Feature importance ────────────────────────────────────────────────────────

  fetchFeatureImportance: async (modelVersion) => {
    set({ importanceLoading: true, importanceError: '' });
    try {
      const data = await api.getMLFeatureImportance(modelVersion);
      const features = Array.isArray(data) ? data : (data.features || []);
      set({ featureImportance: features, importanceLoading: false });
    } catch (err) {
      set({ importanceLoading: false, importanceError: err.message });
    }
  },

  // ── Drift ────────────────────────────────────────────────────────────────────

  fetchDriftMetrics: async () => {
    set({ driftLoading: true, driftError: '' });
    try {
      const data = await api.getMLDriftMetrics();
      set({ driftMetrics: data, driftLoading: false });
    } catch (err) {
      set({ driftLoading: false, driftError: err.message });
    }
  },

  // ── Model card ────────────────────────────────────────────────────────────────

  fetchModelCard: async () => {
    set({ modelCardLoading: true, modelCardError: '' });
    try {
      const data = await api.getMLModelCard();
      set({ modelCard: data, modelCardLoading: false });
    } catch (err) {
      set({ modelCardLoading: false, modelCardError: err.message });
    }
  },

  // ── Diagnostics (Phase 9A compat) ────────────────────────────────────────────

  loadDiagnostics: async () => {
    set({ diagnosticsLoading: true, diagnosticsError: '' });
    try {
      const data = await api.getMLMetrics();
      set({ diagnostics: data, diagnosticsLoading: false });
    } catch (err) {
      set({ diagnosticsLoading: false, diagnosticsError: err.message });
    }
  },

  // ── Models list ───────────────────────────────────────────────────────────────

  loadModels: async (symbol) => {
    set({ modelsLoading: true, modelsError: '' });
    try {
      const data = await api.getMLModels(symbol);
      set({ models: data.models || [], modelsLoading: false });
    } catch (err) {
      set({ modelsLoading: false, modelsError: err.message });
    }
  },

  // ── Refresh all ───────────────────────────────────────────────────────────────

  refreshAll: async (symbol, timeframe = '1m') => {
    await Promise.allSettled([
      get().fetchHealth(),
      get().fetchModelInfo(),
      symbol ? get().loadSignal(symbol, timeframe) : Promise.resolve(),
      get().fetchFeatureImportance(),
      get().fetchDriftMetrics(),
    ]);
  },

  // ── WebSocket signal update ───────────────────────────────────────────────────

  handleWsSignal: (msg) => {
    if (!msg?.symbol) return;
    const sym = msg.symbol.toUpperCase();
    set((s) => ({
      signalBySymbol: { ...s.signalBySymbol, [sym]: { ...msg, asOf: msg.asOf || new Date().toISOString() } },
      lastUpdated: new Date().toISOString(),
    }));
  },

  clearSymbol: (symbol) => {
    const sym = symbol?.toUpperCase();
    if (!sym) return;
    set((s) => {
      const { [sym]: _a, ...signalBySymbol } = s.signalBySymbol;
      const { [sym]: _b, ...signalLoading }  = s.signalLoading;
      const { [sym]: _c, ...signalError }    = s.signalError;
      return { signalBySymbol, signalLoading, signalError };
    });
  },

  reset: () => set(initialState),
}));

// Backward-compat alias for Phase 9A components
export const useMLSignalStore = useMLStore;
