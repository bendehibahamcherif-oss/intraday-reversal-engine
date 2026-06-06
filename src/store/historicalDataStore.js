import { create } from 'zustand';
import { api } from '../api.js';
import { assertDatasetId, getDatasetId, normalizeDataset } from '../utils/datasets.js';

const errMsg = (e) => (e instanceof Error ? e.message : String(e));

export const useHistoricalDataStore = create((set, get) => ({
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

  // ── Actions ──────────────────────────────────────────────────────────────

  fetchProviders: async () => {
    set({ providersLoading: true, providersError: '' });
    try {
      const data = await api.getHistoricalProviders();
      set({ providers: data.providers || [], providersLoading: false });
    } catch (e) {
      set({ providersLoading: false, providersError: errMsg(e) });
    }
  },

  fetchDatasets: async () => {
    set({ datasetsLoading: true, datasetsError: '' });
    try {
      const data = await api.getHistoricalDatasets();
      set({ datasets: (data.datasets || []).map(normalizeDataset), datasetsLoading: false });
    } catch (e) {
      set({ datasetsLoading: false, datasetsError: errMsg(e) });
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
      set({ downloadLoading: false, downloadError: errMsg(e) });
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
      set({ datasetsError: errMsg(e) });
    }
  },

  selectDataset: async (datasetId) => {
    const local = get().datasets.find((d) => getDatasetId(d) === datasetId) || null;
    set({ selectedDatasetId: datasetId, selectedDataset: local });
    if (!datasetId) return;
    try {
      const data = await api.getHistoricalDataset(datasetId);
      const full = normalizeDataset(data.dataset || local);
      set((state) => ({
        selectedDatasetId: getDatasetId(full),
        selectedDataset: full,
        datasets: state.datasets.map((d) => getDatasetId(d) === getDatasetId(full) ? full : d),
      }));
    } catch (e) {
      set({ datasetsError: errMsg(e) });
    }
  },

  clearSelection: () => set({ selectedDatasetId: null, selectedDataset: null }),

  useDatasetForMl: (dataset) => {
    const asserted = assertDatasetId(dataset);
    if (!asserted.ok) { set({ datasetsError: asserted.error }); return asserted; }
    const normalized = normalizeDataset(dataset);
    set({ selectedMlDatasetId: asserted.datasetId, selectedMlDataset: normalized, datasetsError: '' });
    return { ok: true, datasetId: asserted.datasetId, message: `Dataset "${asserted.datasetId}" sent to ML Engine` };
  },

  useDatasetForBacktest: (dataset) => {
    const asserted = assertDatasetId(dataset);
    if (!asserted.ok) { set({ datasetsError: asserted.error }); return asserted; }
    const normalized = normalizeDataset(dataset);
    set({ selectedBacktestDatasetId: asserted.datasetId, selectedBacktestDataset: normalized, datasetsError: '' });
    return { ok: true, datasetId: asserted.datasetId, message: `Dataset "${asserted.datasetId}" sent to Backtesting` };
  },

  useDatasetForCorrelation: (dataset) => {
    const asserted = assertDatasetId(dataset);
    if (!asserted.ok) { set({ datasetsError: asserted.error }); return asserted; }
    const normalized = normalizeDataset(dataset);
    set({ selectedCorrelationDatasetId: asserted.datasetId, selectedCorrelationDataset: normalized, datasetsError: '' });
    return { ok: true, datasetId: asserted.datasetId, message: `Dataset "${asserted.datasetId}" sent to Correlation` };
  },

  clearDownloadResult: () => set({ downloadResult: null, downloadError: '' }),
}));
