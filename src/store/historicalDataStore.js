import { create } from 'zustand';
import { api } from '../api.js';

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
      set({ datasets: data.datasets || [], datasetsLoading: false });
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
        datasets: s.datasets.filter((d) => d.datasetId !== datasetId),
        selectedDatasetId: s.selectedDatasetId === datasetId ? null : s.selectedDatasetId,
        selectedDataset:   s.selectedDatasetId === datasetId ? null : s.selectedDataset,
      }));
    } catch (e) {
      set({ datasetsError: errMsg(e) });
    }
  },

  selectDataset: (datasetId) => {
    const dataset = get().datasets.find((d) => d.datasetId === datasetId) || null;
    set({ selectedDatasetId: datasetId, selectedDataset: dataset });
  },

  clearSelection: () => set({ selectedDatasetId: null, selectedDataset: null }),

  clearDownloadResult: () => set({ downloadResult: null, downloadError: '' }),
}));
