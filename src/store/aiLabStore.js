import { create } from 'zustand';
import { api } from '../api.js';

const toList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.labels)) return payload.labels;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

const errMsg = (err) => err?.message || 'AI Lab request failed';

export const useAILabStore = create((set, get) => ({
  symbol: 'SPY',
  horizon: 10,
  limit: 50,
  featureRecords: [],
  selectedFeatureRecord: null,
  outcomeLabels: [],
  loading: false,
  error: '',
  lastUpdated: null,

  setSymbol: (symbol) => set({ symbol: (symbol || '').trim().toUpperCase() || 'SPY' }),
  setHorizon: (horizon) => set({ horizon: Number(horizon) || 10 }),
  setLimit: (limit) => set({ limit: Number(limit) || 50 }),
  clearError: () => set({ error: '' }),

  saveFeatureRecord: async () => {
    const { symbol } = get();
    set({ loading: true, error: '' });
    try {
      await api.saveFeatureRecord(symbol);
      await get().refreshAll();
    } catch (err) {
      set({ loading: false, error: errMsg(err) });
    }
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
    } catch (err) {
      set({ loading: false, error: errMsg(err), featureRecords: [] });
    }
  },

  selectFeatureRecord: async (id) => {
    if (!id) return;
    set({ loading: true, error: '' });
    try {
      const payload = await api.getFeatureRecord(id);
      const selectedFeatureRecord = payload?.record || payload?.data || payload;
      set({ selectedFeatureRecord, loading: false, lastUpdated: new Date().toISOString() });
    } catch (err) {
      set({ loading: false, error: errMsg(err) });
    }
  },

  clearFeatureRecords: async () => {
    const { symbol } = get();
    set({ loading: true, error: '' });
    try {
      await api.clearFeatureRecords(symbol);
      set({ featureRecords: [], selectedFeatureRecord: null, loading: false, lastUpdated: new Date().toISOString() });
    } catch (err) {
      set({ loading: false, error: errMsg(err) });
    }
  },

  labelSelectedRecord: async () => {
    const { selectedFeatureRecord, horizon } = get();
    const id = selectedFeatureRecord?.id || selectedFeatureRecord?._id;
    if (!id) {
      set({ error: 'Select a feature record first.' });
      return;
    }
    set({ loading: true, error: '' });
    try {
      await api.labelFeatureRecord(id, horizon);
      await get().loadOutcomeLabels();
    } catch (err) {
      set({ loading: false, error: errMsg(err) });
    }
  },

  labelSymbolHistory: async () => {
    const { symbol, horizon, limit } = get();
    set({ loading: true, error: '' });
    try {
      await api.labelSymbolHistory(symbol, horizon, limit);
      await get().loadOutcomeLabels();
    } catch (err) {
      set({ loading: false, error: errMsg(err) });
    }
  },

  loadOutcomeLabels: async () => {
    const { symbol, limit } = get();
    set({ loading: true, error: '' });
    try {
      const payload = await api.getOutcomeLabels(symbol, limit);
      set({ outcomeLabels: toList(payload), loading: false, lastUpdated: new Date().toISOString() });
    } catch (err) {
      set({ loading: false, error: errMsg(err), outcomeLabels: [] });
    }
  },

  clearOutcomeLabels: async () => {
    const { symbol } = get();
    set({ loading: true, error: '' });
    try {
      await api.clearOutcomeLabels(symbol);
      set({ outcomeLabels: [], loading: false, lastUpdated: new Date().toISOString() });
    } catch (err) {
      set({ loading: false, error: errMsg(err) });
    }
  },

  refreshAll: async () => {
    await get().loadFeatureRecords();
    await get().loadOutcomeLabels();
  },
}));
