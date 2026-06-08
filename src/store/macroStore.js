import { create } from 'zustand';
import { api } from '../api.js';
import { getDatasetId, normalizeDataset } from '../utils/datasets.js';

const errMsg = (e) => e?.message || 'Multi-asset error';

const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA', 'TLT', 'GLD'];

export const useMacroStore = create((set, get) => ({
  // ── Config ────────────────────────────────────────────────────────────────
  symbols:       DEFAULT_SYMBOLS,
  symbolsInput:  DEFAULT_SYMBOLS.join(', '),
  benchmark:     'SPY',
  window:        20,
  timeframe:     '1d',
  selectedAsset: 'QQQ',

  // ── Correlation matrix ────────────────────────────────────────────────────
  correlation:        null,
  correlationLoading: false,
  correlationError:   '',
  correlationDatasetId: null,
  selectedCorrelationDatasetId: null,
  selectedCorrelationDataset: null,

  // ── Rolling beta ──────────────────────────────────────────────────────────
  beta:        null,
  betaLoading: false,
  betaError:   '',

  // ── Sector rotation ───────────────────────────────────────────────────────
  sectorRotation:        null,
  sectorRotationLoading: false,
  sectorRotationError:   '',

  // ── Volatility heatmap ────────────────────────────────────────────────────
  volatility:        null,
  volatilityLoading: false,
  volatilityError:   '',

  // ── Setters ───────────────────────────────────────────────────────────────
  setSymbolsInput: (v) => set({ symbolsInput: v }),
  applySymbols: () => {
    const { symbolsInput } = get();
    const symbols = symbolsInput
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 12);
    if (symbols.length >= 2) set({ symbols });
  },
  setBenchmark:     (v) => set({ benchmark: v }),
  setWindow:        (v) => set({ window: Math.max(5, Math.min(252, Number(v) || 20)) }),
  setTimeframe:     (v) => set({ timeframe: v }),
  setSelectedAsset: (v) => set({ selectedAsset: v }),
  clearErrors: () => set({ correlationError: '', betaError: '', sectorRotationError: '', volatilityError: '' }),

  // ── Data loaders ──────────────────────────────────────────────────────────
  setCorrelationDatasetId: (datasetId, dataset = null) => {
    const id = datasetId || getDatasetId(dataset);
    if (!id) return set({ correlationError: 'Dataset ID missing. Reload dataset registry.' });
    set({ correlationDatasetId: id, selectedCorrelationDatasetId: id, selectedCorrelationDataset: dataset ? normalizeDataset(dataset) : get().selectedCorrelationDataset });
  },
  clearCorrelationDatasetId: () => set({ correlationDatasetId: null, selectedCorrelationDatasetId: null, selectedCorrelationDataset: null }),

  loadCorrelation: async () => {
    const { symbols, window: w, timeframe, correlationDatasetId } = get();
    set({ correlationLoading: true, correlationError: '' });
    try {
      const params = { symbols, window: w, timeframe };
      if (correlationDatasetId) params.datasetId = correlationDatasetId;
      const data = await api.getMultiAssetCorrelation(params);
      set({ correlation: data, correlationLoading: false });
    } catch (e) {
      set({ correlationLoading: false, correlationError: errMsg(e) });
    }
  },

  loadBeta: async () => {
    const { selectedAsset, benchmark, window: w, timeframe, correlationDatasetId } = get();
    set({ betaLoading: true, betaError: '' });
    try {
      const data = await api.getMultiAssetBeta({ symbol: selectedAsset, benchmark, window: w, timeframe, datasetId: correlationDatasetId || null });
      set({ beta: data, betaLoading: false });
    } catch (e) {
      set({ betaLoading: false, betaError: errMsg(e) });
    }
  },

  loadSectorRotation: async () => {
    const { symbols, window: w, timeframe, correlationDatasetId } = get();
    set({ sectorRotationLoading: true, sectorRotationError: '' });
    try {
      const data = await api.getMultiAssetSectorRotation({ window: w, timeframe, symbols, datasetId: correlationDatasetId || null });
      set({ sectorRotation: data, sectorRotationLoading: false });
    } catch (e) {
      set({ sectorRotationLoading: false, sectorRotationError: errMsg(e) });
    }
  },

  loadVolatility: async () => {
    const { symbols, window: w, timeframe, correlationDatasetId } = get();
    set({ volatilityLoading: true, volatilityError: '' });
    try {
      const data = await api.getMultiAssetVolatility({ symbols, window: w, timeframe, datasetId: correlationDatasetId || null });
      set({ volatility: data, volatilityLoading: false });
    } catch (e) {
      set({ volatilityLoading: false, volatilityError: errMsg(e) });
    }
  },

  refreshAll: () => {
    const s = get();
    s.loadCorrelation();
    s.loadBeta();
    s.loadSectorRotation();
    s.loadVolatility();
  },
}));
