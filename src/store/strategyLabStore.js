import { create } from 'zustand';
import { api, getStrategyLabDebug } from '../api.js';

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.strategies)) return payload.strategies;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function normalizeOne(payload) {
  if (!payload) return null;
  if (payload.strategy) return payload.strategy;
  if (payload.data) return payload.data;
  return payload;
}

function strategyId(item) {
  return String(item?.id || item?._id || item?.strategyId || '');
}

function normalizeError(err, fallback) {
  if (!err) return fallback;
  if (err?.status === 404 && err?.url) return `HTTP 404 for ${err.url}`;
  if (err?.url && err?.message?.startsWith('HTTP')) return `${err.message} (${err.url})`;
  return err?.message || fallback;
}

export const useStrategyLabStore = create((set, get) => ({
  symbol: 'SPY',
  savedStrategies: [],
  selectedStrategyId: '',
  compareSelection: [],
  compareResult: null,
  manualStrategy: {
    name: '',
    type: '',
    direction: '',
    entryLogic: '',
    exitLogic: '',
  },
  loading: false,
  saving: false,
  comparing: false,
  error: '',
  debug: { lastStrategyLabUrl: '', lastStrategyLabError: '' },

  setSymbol: (symbol) => set({ symbol: symbol?.trim()?.toUpperCase() || 'SPY' }),
  setManualField: (key, value) => set((state) => ({ manualStrategy: { ...state.manualStrategy, [key]: value } })),
  clearError: () => set({ error: '' }),

  loadSavedStrategies: async () => {
    const { symbol } = get();
    set({ loading: true, error: '' });
    try {
      const payload = await api.getSavedStrategies(symbol);
      const savedStrategies = normalizeList(payload);
      const selectedStrategyId = get().selectedStrategyId;
      const hasSelected = savedStrategies.some((item) => strategyId(item) === selectedStrategyId);
      set({
        loading: false,
        savedStrategies,
        selectedStrategyId: hasSelected ? selectedStrategyId : strategyId(savedStrategies[0]) || '',
        debug: getStrategyLabDebug(),
      });
    } catch (err) {
      set({ loading: false, savedStrategies: [], selectedStrategyId: '', error: normalizeError(err, 'Failed to load saved strategies.'), debug: getStrategyLabDebug() });
    }
  },

  selectStrategy: async (id) => {
    if (!id) return set({ selectedStrategyId: '' });
    set({ selectedStrategyId: String(id), error: '' });
    try {
      const payload = await api.getSavedStrategy(id);
      const detail = normalizeOne(payload);
      if (!detail) return;
      set((state) => ({
        savedStrategies: state.savedStrategies.map((item) => (strategyId(item) === String(id) ? { ...item, ...detail } : item)),
      }));
    } catch (err) {
      set({ error: normalizeError(err, 'Failed to load strategy details.'), debug: getStrategyLabDebug() });
    }
  },

  saveManualStrategy: async () => {
    const { symbol, manualStrategy } = get();
    set({ saving: true, error: '' });
    try {
      const payload = await api.saveStrategy(symbol, manualStrategy);
      const saved = normalizeOne(payload);
      await get().loadSavedStrategies();
      set({
        saving: false,
        manualStrategy: { name: '', type: '', direction: '', entryLogic: '', exitLogic: '' },
        selectedStrategyId: strategyId(saved) || get().selectedStrategyId,
        debug: getStrategyLabDebug(),
      });
    } catch (err) {
      set({ saving: false, error: normalizeError(err, 'Failed to save strategy.'), debug: getStrategyLabDebug() });
    }
  },

  updateSelectedStrategy: async (updates) => {
    const id = get().selectedStrategyId;
    if (!id) return;
    set({ saving: true, error: '' });
    try {
      await api.updateSavedStrategy(id, updates || {});
      await get().loadSavedStrategies();
      set({ saving: false, debug: getStrategyLabDebug() });
    } catch (err) {
      set({ saving: false, error: normalizeError(err, 'Failed to update strategy.'), debug: getStrategyLabDebug() });
    }
  },

  deleteSelectedStrategy: async () => {
    const id = get().selectedStrategyId;
    if (!id) return;
    set({ saving: true, error: '' });
    try {
      await api.deleteSavedStrategy(id);
      await get().loadSavedStrategies();
      set((state) => ({
        saving: false,
        compareSelection: state.compareSelection.filter((item) => item !== id),
        debug: getStrategyLabDebug(),
      }));
    } catch (err) {
      set({ saving: false, error: normalizeError(err, 'Failed to delete strategy.'), debug: getStrategyLabDebug() });
    }
  },

  clearSavedStrategies: async () => {
    const symbol = get().symbol;
    set({ saving: true, error: '' });
    try {
      await api.clearSavedStrategies(symbol);
      set({ saving: false, savedStrategies: [], selectedStrategyId: '', compareSelection: [], compareResult: null, debug: getStrategyLabDebug() });
    } catch (err) {
      set({ saving: false, error: normalizeError(err, 'Failed to clear strategies.'), debug: getStrategyLabDebug() });
    }
  },

  toggleCompareStrategy: (id) => set((state) => {
    const key = String(id);
    const has = state.compareSelection.includes(key);
    return { compareSelection: has ? state.compareSelection.filter((item) => item !== key) : [...state.compareSelection, key] };
  }),

  compareSelectedStrategies: async () => {
    const { symbol, compareSelection } = get();
    if (compareSelection.length < 2) {
      set({ error: 'Select at least 2 strategies to compare.' });
      return;
    }

    set({ comparing: true, error: '' });
    try {
      const payload = await api.compareSavedStrategies(symbol, compareSelection);
      set({ comparing: false, compareResult: payload?.comparison || payload?.data || payload || null, debug: getStrategyLabDebug() });
    } catch (err) {
      set({ comparing: false, compareResult: null, error: normalizeError(err, 'Failed to compare strategies.'), debug: getStrategyLabDebug() });
    }
  },
}));
