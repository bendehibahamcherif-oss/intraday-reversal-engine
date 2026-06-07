import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { api } from '../api.js';
import { assertDatasetId, getDatasetId, normalizeDataset } from '../utils/datasets.js';

const errMsg = (e) => (e instanceof Error ? e.message : String(e));

const RAW_API_ERROR_PATTERN = /(?:^\s*[\[{]|\b(?:500|501|404|undefined|nan|infinity)\b|internal server error|request failed with status|\[object object\]|typeerror|referenceerror|cannot read properties|\bat\s+\w+\s*\([^)]*\.jsx?:\d+:\d+\))/i;

export function safeHistoricalError(e, fallback = 'Historical data is unavailable.') {
  const message = errMsg(e);
  if (!message || RAW_API_ERROR_PATTERN.test(message)) return fallback;
  return message;
}

const safeHistoricalStorage = {
  getItem: (name) => { try { return localStorage.getItem(name); } catch { return null; } },
  setItem: (name, value) => { try { localStorage.setItem(name, value); } catch {} },
  removeItem: (name) => { try { localStorage.removeItem(name); } catch {} },
};

const normalizePersistedDataset = (dataset) => dataset ? normalizeDataset(dataset) : null;

export const useHistoricalDataStore = create(
  persist(
    (set, get) => ({
  // Providers
  providers: [],
  providersLoading: false,
  providersError: '',

  // Datasets registry
  datasets: [],
  datasetsLoading: false,
  datasetsError: '',

  // Active download job
  downloadLoading: false,
  downloadError: '',
  downloadResult: null,

  // Selected dataset for cross-workspace use
  selectedDatasetId: null,
  selectedDataset: null,
  selectedMlDatasetId: null,
  selectedMlDataset: null,
  selectedBacktestDatasetId: null,
  selectedBacktestDataset: null,
  selectedCorrelationDatasetId: null,
  selectedCorrelationDataset: null,

  // Diagnostics for selected dataset
  diagnostics: null,
  diagnosticsLoading: false,
  diagnosticsError: '',

  // ── Actions ──────────────────────────────────────────────────────────────

  fetchProviders: async () => {
    set({ providersLoading: true, providersError: '' });
    try {
      const data = await api.getHistoricalProviders();
      set({ providers: data.providers || [], providersLoading: false });
    } catch (e) {
      set({ providersLoading: false, providersError: safeHistoricalError(e, 'Historical data is unavailable.') });
    }
  },

  fetchDatasets: async () => {
    set({ datasetsLoading: true, datasetsError: '' });
    try {
      const data = await api.getHistoricalDatasets();
      set({ datasets: (data.datasets || []).map(normalizeDataset), datasetsLoading: false });
    } catch (e) {
      set({ datasetsLoading: false, datasetsError: safeHistoricalError(e, 'Unable to load historical datasets.') });
    }
  },

  downloadData: async (params) => {
    set({ downloadLoading: true, downloadError: '', downloadResult: null });
    try {
      const data = await api.downloadHistoricalData(params);
      set({ downloadLoading: false, downloadResult: data });
      // Refresh dataset list after a successful download
      get().fetchDatasets();
      return data;
    } catch (e) {
      set({ downloadLoading: false, downloadError: safeHistoricalError(e, 'Historical data is unavailable.') });
      throw e;
    }
  },

  deleteDataset: async (datasetId) => {
    try {
      await api.deleteHistoricalDataset(datasetId);
      set((s) => ({
        datasets: s.datasets.filter((d) => getDatasetId(d) !== datasetId),
        selectedDatasetId: s.selectedDatasetId === datasetId ? null : s.selectedDatasetId,
        selectedDataset:   s.selectedDatasetId === datasetId ? null : s.selectedDataset,
      }));
    } catch (e) {
      set({ datasetsError: safeHistoricalError(e, 'Unable to load historical datasets.') });
    }
  },

  selectDataset: async (datasetId) => {
    const local = get().datasets.find((d) => getDatasetId(d) === datasetId) || null;
    set({ selectedDatasetId: datasetId, selectedDataset: local, diagnostics: null, diagnosticsError: '' });
    if (!datasetId) return;
    // Fetch diagnostics and full dataset record concurrently
    get().fetchDiagnostics(datasetId);
    try {
      const data = await api.getHistoricalDataset(datasetId);
      const full = normalizeDataset(data.dataset || local);
      set((state) => ({
        selectedDatasetId: getDatasetId(full),
        selectedDataset: full,
        datasets: state.datasets.map((d) => getDatasetId(d) === getDatasetId(full) ? full : d),
      }));
    } catch (e) {
      set({ datasetsError: safeHistoricalError(e, 'Unable to load historical datasets.') });
    }
  },

  clearSelection: () => set({ selectedDatasetId: null, selectedDataset: null, diagnostics: null, diagnosticsError: '' }),

  fetchDiagnostics: async (datasetId) => {
    if (!datasetId) return;
    set({ diagnosticsLoading: true, diagnosticsError: '' });
    try {
      const data = await api.getHistoricalDatasetDiagnostics(datasetId);
      set({ diagnostics: data, diagnosticsLoading: false });
    } catch (e) {
      set({ diagnosticsLoading: false, diagnosticsError: safeHistoricalError(e, 'Historical data is unavailable.') });
    }
  },

  useDatasetForMl: (dataset) => {
    const asserted = assertDatasetId(dataset);
    if (!asserted.ok) { set({ datasetsError: asserted.error }); return asserted; }
    const normalized = normalizeDataset(dataset);
    set({ selectedMlDatasetId: asserted.datasetId, selectedMlDataset: normalized, datasetsError: '' });
    api.useHistoricalDatasetForMl?.(asserted.datasetId)
      ?.then((response) => {
        if (response?.dataset) set({ selectedMlDataset: normalizeDataset(response.dataset), datasetsError: '' });
      })
      .catch((e) => set({ datasetsError: safeHistoricalError(e, 'Unable to load historical datasets.') }));
    return { ok: true, datasetId: asserted.datasetId, dataset: normalized, message: `Dataset "${asserted.datasetId}" sent to ML Engine` };
  },

  useDatasetForBacktest: (dataset) => {
    const asserted = assertDatasetId(dataset);
    if (!asserted.ok) { set({ datasetsError: asserted.error }); return asserted; }
    const normalized = normalizeDataset(dataset);
    set({ selectedBacktestDatasetId: asserted.datasetId, selectedBacktestDataset: normalized, datasetsError: '' });
    api.useHistoricalDatasetForBacktest?.(asserted.datasetId)
      ?.then((response) => {
        if (response?.dataset) set({ selectedBacktestDataset: normalizeDataset(response.dataset), datasetsError: '' });
      })
      .catch((e) => set({ datasetsError: safeHistoricalError(e, 'Unable to load historical datasets.') }));
    return { ok: true, datasetId: asserted.datasetId, dataset: normalized, message: `Dataset "${asserted.datasetId}" sent to Backtesting` };
  },

  useDatasetForCorrelation: (dataset) => {
    const asserted = assertDatasetId(dataset);
    if (!asserted.ok) { set({ datasetsError: asserted.error }); return asserted; }
    const normalized = normalizeDataset(dataset);
    set({ selectedCorrelationDatasetId: asserted.datasetId, selectedCorrelationDataset: normalized, datasetsError: '' });
    api.useHistoricalDatasetForCorrelation?.(asserted.datasetId)
      ?.then((response) => {
        if (response?.dataset) set({ selectedCorrelationDataset: normalizeDataset(response.dataset), datasetsError: '' });
      })
      .catch((e) => set({ datasetsError: safeHistoricalError(e, 'Unable to load historical datasets.') }));
    return { ok: true, datasetId: asserted.datasetId, dataset: normalized, message: `Dataset "${asserted.datasetId}" sent to Correlation` };
  },

  clearDownloadResult: () => set({ downloadResult: null, downloadError: '' }),
}),
    {
      name: 'reversal-historical-selection-v2',
      version: 2,
      storage: createJSONStorage(() => safeHistoricalStorage),
      partialize: (state) => ({
        selectedDatasetId: state.selectedDatasetId || null,
        selectedDataset: normalizePersistedDataset(state.selectedDataset),
        selectedMlDatasetId: state.selectedMlDatasetId || null,
        selectedMlDataset: normalizePersistedDataset(state.selectedMlDataset),
        selectedBacktestDatasetId: state.selectedBacktestDatasetId || null,
        selectedBacktestDataset: normalizePersistedDataset(state.selectedBacktestDataset),
        selectedCorrelationDatasetId: state.selectedCorrelationDatasetId || null,
        selectedCorrelationDataset: normalizePersistedDataset(state.selectedCorrelationDataset),
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        selectedDatasetId: persistedState?.selectedDatasetId || null,
        selectedDataset: normalizePersistedDataset(persistedState?.selectedDataset),
        selectedMlDatasetId: persistedState?.selectedMlDatasetId || null,
        selectedMlDataset: normalizePersistedDataset(persistedState?.selectedMlDataset),
        selectedBacktestDatasetId: persistedState?.selectedBacktestDatasetId || null,
        selectedBacktestDataset: normalizePersistedDataset(persistedState?.selectedBacktestDataset),
        selectedCorrelationDatasetId: persistedState?.selectedCorrelationDatasetId || null,
        selectedCorrelationDataset: normalizePersistedDataset(persistedState?.selectedCorrelationDataset),
      }),
    }
  )
);
