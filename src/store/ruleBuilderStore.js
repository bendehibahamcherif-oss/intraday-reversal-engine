import { create } from 'zustand';
import { api } from '../api.js';

const defaultCondition = () => ({
  source: '',
  field: '',
  operator: 'equals',
  value: '',
  timeframe: '',
  enabled: true,
});

const defaultAction = () => ({
  type: '',
  direction: '',
  entryLogic: '',
  exitLogic: '',
  stopLossLogic: '',
  takeProfitLogic: '',
  invalidationCondition: '',
  riskRules: '',
});

const createDraftRuleSet = (symbol = 'SPY') => ({
  name: '',
  description: '',
  symbol,
  conditions: [defaultCondition()],
  actions: [defaultAction()],
  riskRules: '',
});

const normalizeList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.ruleSets)) return payload.ruleSets;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

const normalizeOne = (payload) => payload?.ruleSet || payload?.data || payload;
const itemId = (item) => String(item?.id || item?._id || item?.ruleSetId || '');
const nowIso = () => new Date().toISOString();
const errMsg = (err, fallback) => err?.message || fallback;

export const useRuleBuilderStore = create((set, get) => ({
  symbol: 'SPY',
  ruleSets: [],
  selectedRuleSet: null,
  draftRuleSet: createDraftRuleSet('SPY'),
  evaluationResult: null,
  convertedStrategy: null,
  loading: false,
  error: '',
  lastUpdated: '',

  setSymbol: (symbol) => {
    const clean = symbol?.trim()?.toUpperCase() || 'SPY';
    set({ symbol: clean, draftRuleSet: { ...get().draftRuleSet, symbol: clean } });
  },

  loadRuleSets: async () => {
    const { symbol } = get();
    set({ loading: true, error: '' });
    try {
      const payload = await api.getRuleSets(symbol);
      const ruleSets = normalizeList(payload);
      const selectedId = itemId(get().selectedRuleSet);
      const selectedRuleSet = ruleSets.find((item) => itemId(item) === selectedId) || ruleSets[0] || null;
      set({
        loading: false,
        ruleSets,
        selectedRuleSet,
        lastUpdated: nowIso(),
      });
    } catch (err) {
      set({ loading: false, ruleSets: [], selectedRuleSet: null, error: errMsg(err, 'Failed to load rule sets.') });
    }
  },

  createRuleSet: async () => {
    const { symbol, draftRuleSet } = get();
    set({ loading: true, error: '' });
    try {
      const payload = await api.createRuleSet(symbol, draftRuleSet);
      const created = normalizeOne(payload) || draftRuleSet;
      await get().loadRuleSets();
      set({
        loading: false,
        selectedRuleSet: created,
        draftRuleSet: { ...createDraftRuleSet(symbol), ...created },
        lastUpdated: nowIso(),
      });
    } catch (err) {
      set({ loading: false, error: errMsg(err, 'Failed to create rule set.') });
    }
  },

  selectRuleSet: async (id) => {
    if (!id) return set({ selectedRuleSet: null });
    set({ loading: true, error: '' });
    try {
      const payload = await api.getRuleSet(id);
      const ruleSet = normalizeOne(payload);
      set({
        loading: false,
        selectedRuleSet: ruleSet,
        draftRuleSet: { ...createDraftRuleSet(get().symbol), ...ruleSet },
        evaluationResult: null,
        convertedStrategy: null,
        lastUpdated: nowIso(),
      });
    } catch (err) {
      set({ loading: false, error: errMsg(err, 'Failed to load rule set.') });
    }
  },

  updateDraftField: (field, value) => set((state) => ({ draftRuleSet: { ...state.draftRuleSet, [field]: value } })),

  addCondition: () => set((state) => ({ draftRuleSet: { ...state.draftRuleSet, conditions: [...(state.draftRuleSet.conditions || []), defaultCondition()] } })),
  updateCondition: (index, updates) => set((state) => ({
    draftRuleSet: {
      ...state.draftRuleSet,
      conditions: (state.draftRuleSet.conditions || []).map((item, idx) => (idx === index ? { ...item, ...updates } : item)),
    },
  })),
  removeCondition: (index) => set((state) => ({
    draftRuleSet: {
      ...state.draftRuleSet,
      conditions: (state.draftRuleSet.conditions || []).filter((_, idx) => idx !== index),
    },
  })),

  addAction: () => set((state) => ({ draftRuleSet: { ...state.draftRuleSet, actions: [...(state.draftRuleSet.actions || []), defaultAction()] } })),
  updateAction: (index, updates) => set((state) => ({
    draftRuleSet: {
      ...state.draftRuleSet,
      actions: (state.draftRuleSet.actions || []).map((item, idx) => (idx === index ? { ...item, ...updates } : item)),
    },
  })),
  removeAction: (index) => set((state) => ({
    draftRuleSet: {
      ...state.draftRuleSet,
      actions: (state.draftRuleSet.actions || []).filter((_, idx) => idx !== index),
    },
  })),

  saveDraft: async () => {
    const { selectedRuleSet, draftRuleSet } = get();
    const id = itemId(selectedRuleSet);
    set({ loading: true, error: '' });
    try {
      const payload = id
        ? await api.updateRuleSet(id, draftRuleSet)
        : await api.createRuleSet(get().symbol, draftRuleSet);
      const saved = normalizeOne(payload) || draftRuleSet;
      await get().loadRuleSets();
      set({ loading: false, selectedRuleSet: saved, draftRuleSet: { ...createDraftRuleSet(get().symbol), ...saved }, lastUpdated: nowIso() });
    } catch (err) {
      set({ loading: false, error: errMsg(err, 'Failed to save rule set.') });
    }
  },

  evaluateSelected: async () => {
    const id = itemId(get().selectedRuleSet);
    if (!id) return set({ error: 'Select a rule set before evaluating.' });
    set({ loading: true, error: '' });
    try {
      const payload = await api.evaluateRuleSet(get().symbol, id);
      set({ loading: false, evaluationResult: payload, lastUpdated: nowIso() });
    } catch (err) {
      set({ loading: false, error: errMsg(err, 'Failed to evaluate rule set.') });
    }
  },

  convertSelected: async () => {
    const id = itemId(get().selectedRuleSet);
    if (!id) return set({ error: 'Select a rule set before converting.' });
    set({ loading: true, error: '' });
    try {
      const payload = await api.convertRuleSet(get().symbol, id);
      set({ loading: false, convertedStrategy: payload, lastUpdated: nowIso() });
    } catch (err) {
      set({ loading: false, error: errMsg(err, 'Failed to convert rule set.') });
    }
  },

  deleteSelected: async () => {
    const id = itemId(get().selectedRuleSet);
    if (!id) return;
    set({ loading: true, error: '' });
    try {
      await api.deleteRuleSet(id);
      await get().loadRuleSets();
      set({ loading: false, selectedRuleSet: null, draftRuleSet: createDraftRuleSet(get().symbol), evaluationResult: null, convertedStrategy: null, lastUpdated: nowIso() });
    } catch (err) {
      set({ loading: false, error: errMsg(err, 'Failed to delete rule set.') });
    }
  },

  clearRuleSets: async () => {
    set({ loading: true, error: '' });
    try {
      await api.clearRuleSets(get().symbol);
      set({ loading: false, ruleSets: [], selectedRuleSet: null, draftRuleSet: createDraftRuleSet(get().symbol), evaluationResult: null, convertedStrategy: null, lastUpdated: nowIso() });
    } catch (err) {
      set({ loading: false, error: errMsg(err, 'Failed to clear rule sets.') });
    }
  },

  clearError: () => set({ error: '' }),
}));
