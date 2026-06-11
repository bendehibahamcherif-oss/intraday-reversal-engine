import { create } from 'zustand';
import { api } from '../api.js';
import { getDatasetId, normalizeDataset } from '../utils/datasets.js';
import { resolveDataRequirement, normalizeRequirementSymbols } from '../services/dataRequirementResolver.js';

const errMsg = (e) => e?.message || 'Multi-asset error';

const DEFAULT_SYMBOLS = ['SPY', 'NFLX'];
export const MACRO_SELECTED_DATASET_STORAGE_KEY = 'reversal-macro-selected-correlation-dataset-id';
export const MACRO_SYMBOLS_STORAGE_KEY = 'reversal-macro-symbols';

function safeGetStorage(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSetStorage(key, value) { try { localStorage.setItem(key, value); } catch {} }
function safeRemoveStorage(key) { try { localStorage.removeItem(key); } catch {} }

export function parseMacroSymbols(value, fallback = DEFAULT_SYMBOLS) {
  const raw = Array.isArray(value) ? value.join(',') : String(value || '');
  const symbols = normalizeRequirementSymbols(raw.split(/[\s,]+/)).slice(0, 12);
  return symbols.length >= 2 ? symbols : fallback;
}

function initialSymbols() {
  const persisted = safeGetStorage(MACRO_SYMBOLS_STORAGE_KEY);
  if (persisted) return parseMacroSymbols(persisted, DEFAULT_SYMBOLS);
  try {
    const legacy = JSON.parse(safeGetStorage('reversal-macro') || 'null');
    const state = legacy?.state || legacy;
    if (state?.symbolsInput || state?.symbols) return parseMacroSymbols(state.symbolsInput || state.symbols, DEFAULT_SYMBOLS);
  } catch {}
  return DEFAULT_SYMBOLS;
}

function normalizeBetaSelection(symbols, selectedAsset, benchmark) {
  const list = parseMacroSymbols(symbols, DEFAULT_SYMBOLS);
  let bm = String(benchmark || list[0]).trim().toUpperCase();
  if (!list.includes(bm)) bm = list[0];
  let asset = String(selectedAsset || list[1] || list[0]).trim().toUpperCase();
  if (!list.includes(asset)) asset = list.find((s) => s !== bm) || list[0];
  if (list.length >= 2 && asset === bm) asset = list.find((s) => s !== bm) || list[1];
  return { selectedAsset: asset, benchmark: bm };
}

async function resolveMacroDatasets({ symbols, timeframe, window, selectedDatasetId }) {
  const resolution = await resolveDataRequirement({
    moduleId: 'MacroMultiAsset',
    purpose: 'correlation',
    symbols,
    timeframe,
    selectedDatasetId,
    minimumRows: Number(window) + 1,
  });
  return resolution;
}

const bootSymbols = initialSymbols();
const bootBeta = normalizeBetaSelection(bootSymbols, 'NFLX', 'SPY');

export const useMacroStore = create((set, get) => ({
  // ── Config ────────────────────────────────────────────────────────────────
  symbols:       bootSymbols,
  symbolsInput:  bootSymbols.join(', '),
  benchmark:     bootBeta.benchmark,
  window:        20,
  timeframe:     '1d',
  selectedAsset: bootBeta.selectedAsset,

  // ── Correlation matrix ────────────────────────────────────────────────────
  correlation:        null,
  correlationLoading: false,
  correlationError:   '',
  correlationDatasetId: safeGetStorage(MACRO_SELECTED_DATASET_STORAGE_KEY),
  selectedCorrelationDatasetId: safeGetStorage(MACRO_SELECTED_DATASET_STORAGE_KEY),
  selectedCorrelationDataset: null,
  lastResolution: null,
  lastRequest: null,
  clearedStaleDatasetId: false,

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
    const symbols = parseMacroSymbols(get().symbolsInput, DEFAULT_SYMBOLS);
    const beta = normalizeBetaSelection(symbols, get().selectedAsset, get().benchmark);
    safeSetStorage(MACRO_SYMBOLS_STORAGE_KEY, symbols.join(','));
    set({ symbols, symbolsInput: symbols.join(', '), ...beta, correlation: null, correlationError: '', beta: null, betaError: '', lastResolution: null, lastRequest: null });
    get().refreshAll();
  },
  setBenchmark: (v) => {
    const next = normalizeBetaSelection(get().symbols, get().selectedAsset, v);
    set(next);
  },
  setWindow:        (v) => set({ window: Math.max(5, Math.min(252, Number(v) || 20)) }),
  setTimeframe:     (v) => set({ timeframe: v }),
  setSelectedAsset: (v) => {
    const next = normalizeBetaSelection(get().symbols, v, get().benchmark);
    set(next);
  },
  clearErrors: () => set({ correlationError: '', betaError: '', sectorRotationError: '', volatilityError: '' }),

  // ── Data loaders ──────────────────────────────────────────────────────────
  setCorrelationDatasetId: (datasetId, dataset = null) => {
    const id = datasetId || getDatasetId(dataset);
    if (!id) return set({ correlationError: 'Dataset ID missing. Reload dataset registry.' });
    safeSetStorage(MACRO_SELECTED_DATASET_STORAGE_KEY, id);
    set({ correlationDatasetId: id, selectedCorrelationDatasetId: id, selectedCorrelationDataset: dataset ? normalizeDataset(dataset) : get().selectedCorrelationDataset, clearedStaleDatasetId: false });
  },
  clearCorrelationDatasetId: () => {
    safeRemoveStorage(MACRO_SELECTED_DATASET_STORAGE_KEY);
    set({ correlationDatasetId: null, selectedCorrelationDatasetId: null, selectedCorrelationDataset: null });
  },
  validateSelectedCorrelationDataset: (datasets = []) => {
    const id = get().correlationDatasetId || safeGetStorage(MACRO_SELECTED_DATASET_STORAGE_KEY);
    if (!id) return false;
    const exists = (datasets || []).some((dataset) => getDatasetId(dataset) === id);
    if (!exists) {
      safeRemoveStorage(MACRO_SELECTED_DATASET_STORAGE_KEY);
      set({ correlationDatasetId: null, selectedCorrelationDatasetId: null, selectedCorrelationDataset: null, clearedStaleDatasetId: true });
      return true;
    }
    return false;
  },

  loadCorrelation: async () => {
    const symbols = parseMacroSymbols(get().symbolsInput, get().symbols);
    const { window: w, timeframe, correlationDatasetId } = get();
    set({ symbols, correlationLoading: true, correlationError: '' });
    try {
      const resolution = await resolveMacroDatasets({ symbols, timeframe, window: w, selectedDatasetId: correlationDatasetId });
      set({ lastResolution: resolution });
      if (!['ready', 'ready_multi_dataset'].includes(resolution.status)) {
        if (!(correlationDatasetId && getDatasetId(get().selectedCorrelationDataset) === correlationDatasetId)) {
          set({ correlation: resolution, correlationLoading: false });
          return;
        }
      }
      const params = { symbols, window: w, timeframe, datasetIds: resolution.datasetIds, datasetId: resolution.resolution === 'single_dataset' ? resolution.datasetId : correlationDatasetId || null };
      set({ lastRequest: { type: 'correlation', ...params } });
      const data = await api.getMultiAssetCorrelation(params);
      set({ correlation: { ...data, symbols, datasetsBySymbol: data.datasetsBySymbol || resolution.datasetsBySymbol, resolution: data.resolution || resolution.resolution }, correlationLoading: false });
    } catch (e) {
      set({ correlationLoading: false, correlationError: errMsg(e) });
    }
  },

  loadBeta: async () => {
    const symbols = parseMacroSymbols(get().symbolsInput, get().symbols);
    const betaSelection = normalizeBetaSelection(symbols, get().selectedAsset, get().benchmark);
    const { window: w, timeframe, correlationDatasetId } = get();
    set({ symbols, ...betaSelection, betaLoading: true, betaError: '' });
    try {
      const resolution = await resolveMacroDatasets({ symbols, timeframe, window: w, selectedDatasetId: correlationDatasetId });
      set({ lastResolution: resolution });
      if (!['ready', 'ready_multi_dataset'].includes(resolution.status)) {
        if (!(correlationDatasetId && getDatasetId(get().selectedCorrelationDataset) === correlationDatasetId)) {
          set({ beta: resolution, betaLoading: false });
          return;
        }
      }
      const params = { symbol: betaSelection.selectedAsset, asset: betaSelection.selectedAsset, benchmark: betaSelection.benchmark, symbols, window: w, timeframe, datasetIds: resolution.datasetIds, datasetId: resolution.resolution === 'single_dataset' ? resolution.datasetId : correlationDatasetId || null };
      set({ lastRequest: { type: 'beta', ...params } });
      const data = await api.getMultiAssetBeta(params);
      set({ beta: { ...data, datasetsBySymbol: data.datasetsBySymbol || resolution.datasetsBySymbol, resolution: data.resolution || resolution.resolution }, betaLoading: false });
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
    const symbols = parseMacroSymbols(get().symbolsInput, get().symbols);
    const beta = normalizeBetaSelection(symbols, get().selectedAsset, get().benchmark);
    set({ symbols, symbolsInput: symbols.join(', '), ...beta });
    const s = get();
    s.loadCorrelation();
    s.loadBeta();
    s.loadSectorRotation();
    s.loadVolatility();
  },
}));
