import { create } from 'zustand';
import { api } from '../api.js';

// ── Public constants (consumed by ConditionGroupBuilder / RuleActionEditor) ───
export const ALLOWED_SOURCES = [
  'alpha', 'pattern', 'quantFeature', 'qualityScore',
  'analytics', 'backtest', 'strategy', 'sessionContext',
];
export const ALLOWED_OPERATORS = ['>', '>=', '<', '<=', '==', '!=', 'contains', 'exists'];
export const VALUE_OPERATORS = new Set(['>', '>=', '<', '<=', '==', '!=', 'contains']);
export const ACTION_TYPES = ['entry_exit', 'reversal_entry', 'breakout_entry', 'mean_reversion'];
export const DIRECTIONS = ['long', 'short', 'neutral'];

// ── Factories ─────────────────────────────────────────────────────────────────
const uid = () => `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

// Bug fix: was 'equals' which is NOT in ALLOWED_OPERATORS → always returned false.
const defaultCondition = (groupId = 'default') => ({
  source: '',
  field: '',
  operator: 'exists',
  value: '',
  timeframe: '',
  enabled: true,
  groupId,
});

const defaultAction = () => ({
  type: 'entry_exit',
  direction: '',
  entryLogic: '',
  exitLogic: '',
  stopLossLogic: '',
  takeProfitLogic: '',
  invalidationCondition: '',
  riskRules: '',
});

const defaultGroup = () => ({ id: 'default', operator: 'AND', label: '' });

const createDraftRuleSet = (symbol = 'SPY') => ({
  name: '',
  description: '',
  symbol,
  timeframe: '5m',
  conditions: [defaultCondition()],
  actions: [defaultAction()],
  riskRules: '',
  conditionGroups: [defaultGroup()],
});

// ── Normalizers ───────────────────────────────────────────────────────────────
const normalizeList = (p) => {
  if (Array.isArray(p)) return p;
  if (Array.isArray(p?.ruleSets)) return p.ruleSets;
  if (Array.isArray(p?.data)) return p.data;
  if (Array.isArray(p?.items)) return p.items;
  return [];
};
const normalizeOne = (p) => p?.ruleSet || p?.data || p;
const normalizeTemplates = (p) => p?.templates || p?.data || p?.items || p || [];
const normalizeTemplate = (p) => p?.template || p?.data || p;
const normalizeCreated = (p) => p?.ruleSet || p?.createdRuleSet || p?.data?.ruleSet || p?.data || p;
const itemId = (item) => String(item?.id || item?._id || item?.ruleSetId || '');
const nowIso = () => new Date().toISOString();
const errMsg = (err, fb) => err?.message || fb;

// Backward-compat: backend may not yet return conditionGroups / groupId.
const hydrateRuleSet = (rs) => {
  if (!rs) return rs;
  const groups = Array.isArray(rs.conditionGroups) && rs.conditionGroups.length
    ? rs.conditionGroups
    : [defaultGroup()];
  const conditions = (Array.isArray(rs.conditions) ? rs.conditions : []).map((c) => ({
    ...c,
    groupId: c.groupId || 'default',
    operator: ALLOWED_OPERATORS.includes(c.operator) ? c.operator : 'exists',
  }));
  return { ...rs, conditionGroups: groups, conditions };
};

// ── Field-level validation (pure, no side-effects) ────────────────────────────
export function validateDraftRuleSet(draft) {
  const e = {};
  if (!String(draft?.name || '').trim()) e.name = 'Name is required.';
  (draft?.conditions || []).forEach((c, i) => {
    if (!c.source) {
      e[`conditions.${i}.source`] = 'Source required.';
    } else if (!ALLOWED_SOURCES.includes(c.source)) {
      e[`conditions.${i}.source`] = `Must be one of: ${ALLOWED_SOURCES.join(', ')}.`;
    }
    if (!c.operator) {
      e[`conditions.${i}.operator`] = 'Operator required.';
    } else if (!ALLOWED_OPERATORS.includes(c.operator)) {
      e[`conditions.${i}.operator`] = `Invalid — use: ${ALLOWED_OPERATORS.join(', ')}.`;
    }
    if (VALUE_OPERATORS.has(c.operator) && (c.value === '' || c.value == null)) {
      e[`conditions.${i}.value`] = 'Value required for this operator.';
    }
  });
  (draft?.actions || []).forEach((a, i) => {
    if (!a.direction) e[`actions.${i}.direction`] = 'Direction required.';
    else if (!DIRECTIONS.includes(a.direction)) e[`actions.${i}.direction`] = 'Must be long, short, or neutral.';
    if (!String(a.entryLogic || '').trim()) e[`actions.${i}.entryLogic`] = 'Entry logic required.';
  });
  return e;
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useRuleBuilderStore = create((set, get) => ({
  symbol: 'SPY',
  ruleSets: [],
  selectedRuleSet: null,
  draftRuleSet: createDraftRuleSet('SPY'),
  evaluationResult: null,
  convertedStrategy: null,
  loading: false,
  error: '',

  // Condition groups (frontend-only model — serialized to backend but may be ignored there)
  // conditionGroups live on draftRuleSet.conditionGroups, not top-level.

  // Preview backtest (POST /api/backtest/run/:symbol)
  previewBacktest: null,
  previewLoading: false,

  // Legal disclaimer gate — must be accepted before preview renders.
  disclaimerAccepted: false,

  // Live validation errors keyed by field path, recomputed on every draft mutation.
  draftValidationErrors: {},

  templates: [],
  selectedTemplate: null,
  templateLoading: false,
  templateError: '',
  lastUpdated: '',

  // ── Symbol ───────────────────────────────────────────────────────────────────
  setSymbol: (symbol) => {
    const clean = symbol?.trim()?.toUpperCase() || 'SPY';
    set((s) => ({
      symbol: clean,
      draftRuleSet: { ...s.draftRuleSet, symbol: clean },
      previewBacktest: null,
    }));
  },

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  loadRuleSets: async () => {
    const { symbol } = get();
    set({ loading: true, error: '' });
    try {
      const payload = await api.getRuleSets(symbol);
      const ruleSets = normalizeList(payload).map(hydrateRuleSet);
      const selectedId = itemId(get().selectedRuleSet);
      const selectedRuleSet = ruleSets.find((r) => itemId(r) === selectedId) || ruleSets[0] || null;
      set({ loading: false, ruleSets, selectedRuleSet, lastUpdated: nowIso() });
    } catch (err) {
      set({ loading: false, ruleSets: [], selectedRuleSet: null, error: errMsg(err, 'Failed to load rule sets.') });
    }
  },

  createRuleSet: async () => {
    const { symbol, draftRuleSet } = get();
    set({ loading: true, error: '' });
    try {
      const payload = await api.createRuleSet(symbol, draftRuleSet);
      const created = hydrateRuleSet(normalizeOne(payload) || draftRuleSet);
      await get().loadRuleSets();
      const errors = validateDraftRuleSet(created);
      set({ loading: false, selectedRuleSet: created, draftRuleSet: { ...createDraftRuleSet(symbol), ...created }, draftValidationErrors: errors, lastUpdated: nowIso() });
    } catch (err) {
      set({ loading: false, error: errMsg(err, 'Failed to create rule set.') });
    }
  },

  selectRuleSet: async (id) => {
    if (!id) return set({ selectedRuleSet: null });
    set({ loading: true, error: '' });
    try {
      const payload = await api.getRuleSet(id);
      const ruleSet = hydrateRuleSet(normalizeOne(payload));
      const errors = validateDraftRuleSet(ruleSet);
      set({
        loading: false,
        selectedRuleSet: ruleSet,
        draftRuleSet: { ...createDraftRuleSet(get().symbol), ...ruleSet },
        draftValidationErrors: errors,
        evaluationResult: null,
        convertedStrategy: null,
        previewBacktest: null,
        lastUpdated: nowIso(),
      });
    } catch (err) {
      set({ loading: false, error: errMsg(err, 'Failed to load rule set.') });
    }
  },

  // ── Draft mutations (all recompute validation errors) ─────────────────────────
  _setDraft: (updater) => {
    set((s) => {
      const next = typeof updater === 'function' ? updater(s.draftRuleSet) : updater;
      return { draftRuleSet: next, draftValidationErrors: validateDraftRuleSet(next) };
    });
  },

  updateDraftField: (field, value) => get()._setDraft((d) => ({ ...d, [field]: value })),

  // Conditions
  addCondition: (groupId = 'default') => get()._setDraft((d) => ({
    ...d,
    conditions: [...(d.conditions || []), defaultCondition(groupId)],
  })),

  updateCondition: (index, updates) => get()._setDraft((d) => ({
    ...d,
    conditions: (d.conditions || []).map((c, i) => (i === index ? { ...c, ...updates } : c)),
  })),

  removeCondition: (index) => get()._setDraft((d) => ({
    ...d,
    conditions: (d.conditions || []).filter((_, i) => i !== index),
  })),

  // Reorder conditions via HTML5 drag-and-drop
  moveCondition: (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    get()._setDraft((d) => {
      const arr = [...(d.conditions || [])];
      const [item] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, item);
      return { ...d, conditions: arr };
    });
  },

  // Reassign condition to a different group
  setConditionGroup: (conditionIndex, groupId) => get()._setDraft((d) => ({
    ...d,
    conditions: (d.conditions || []).map((c, i) => (i === conditionIndex ? { ...c, groupId } : c)),
  })),

  // Condition groups
  addConditionGroup: (operator = 'AND', label = '') => get()._setDraft((d) => ({
    ...d,
    conditionGroups: [...(d.conditionGroups || [defaultGroup()]), { id: uid(), operator, label }],
  })),

  updateConditionGroup: (groupId, updates) => get()._setDraft((d) => ({
    ...d,
    conditionGroups: (d.conditionGroups || []).map((g) => (g.id === groupId ? { ...g, ...updates } : g)),
  })),

  removeConditionGroup: (groupId) => {
    if (groupId === 'default') return; // cannot remove default group
    get()._setDraft((d) => ({
      ...d,
      conditionGroups: (d.conditionGroups || []).filter((g) => g.id !== groupId),
      // Move orphaned conditions to default group
      conditions: (d.conditions || []).map((c) => (c.groupId === groupId ? { ...c, groupId: 'default' } : c)),
    }));
  },

  // Actions
  addAction: () => get()._setDraft((d) => ({
    ...d,
    actions: [...(d.actions || []), defaultAction()],
  })),

  updateAction: (index, updates) => get()._setDraft((d) => ({
    ...d,
    actions: (d.actions || []).map((a, i) => (i === index ? { ...a, ...updates } : a)),
  })),

  removeAction: (index) => get()._setDraft((d) => ({
    ...d,
    actions: (d.actions || []).filter((_, i) => i !== index),
  })),

  moveAction: (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    get()._setDraft((d) => {
      const arr = [...(d.actions || [])];
      const [item] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, item);
      return { ...d, actions: arr };
    });
  },

  // ── Save / Evaluate / Convert ─────────────────────────────────────────────────
  saveDraft: async () => {
    const { selectedRuleSet, draftRuleSet } = get();
    const id = itemId(selectedRuleSet);
    set({ loading: true, error: '' });
    try {
      const payload = id
        ? await api.updateRuleSet(id, draftRuleSet)
        : await api.createRuleSet(get().symbol, draftRuleSet);
      const saved = hydrateRuleSet(normalizeOne(payload) || draftRuleSet);
      await get().loadRuleSets();
      const errors = validateDraftRuleSet(saved);
      set({ loading: false, selectedRuleSet: saved, draftRuleSet: { ...createDraftRuleSet(get().symbol), ...saved }, draftValidationErrors: errors, lastUpdated: nowIso() });
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

  // ── Preview backtest ──────────────────────────────────────────────────────────
  runPreviewBacktest: async () => {
    const { symbol, draftRuleSet } = get();
    set({ previewLoading: true, error: '' });
    try {
      const timeframe = draftRuleSet?.timeframe || '5m';
      const payload = await api.runBacktest(symbol, null, timeframe);
      const result = payload?.result || payload;
      set({ previewLoading: false, previewBacktest: result, lastUpdated: nowIso() });
    } catch (err) {
      set({ previewLoading: false, error: errMsg(err, 'Preview backtest failed.') });
    }
  },

  // ── Disclaimer ────────────────────────────────────────────────────────────────
  acceptDisclaimer: () => set({ disclaimerAccepted: true }),

  // ── Delete / Clear ────────────────────────────────────────────────────────────
  deleteSelected: async () => {
    const id = itemId(get().selectedRuleSet);
    if (!id) return;
    set({ loading: true, error: '' });
    try {
      await api.deleteRuleSet(id);
      await get().loadRuleSets();
      set({ loading: false, selectedRuleSet: null, draftRuleSet: createDraftRuleSet(get().symbol), draftValidationErrors: {}, evaluationResult: null, convertedStrategy: null, previewBacktest: null, lastUpdated: nowIso() });
    } catch (err) {
      set({ loading: false, error: errMsg(err, 'Failed to delete rule set.') });
    }
  },

  clearRuleSets: async () => {
    set({ loading: true, error: '' });
    try {
      await api.clearRuleSets(get().symbol);
      set({ loading: false, ruleSets: [], selectedRuleSet: null, draftRuleSet: createDraftRuleSet(get().symbol), draftValidationErrors: {}, evaluationResult: null, convertedStrategy: null, previewBacktest: null, lastUpdated: nowIso() });
    } catch (err) {
      set({ loading: false, error: errMsg(err, 'Failed to clear rule sets.') });
    }
  },

  // ── Templates ─────────────────────────────────────────────────────────────────
  loadTemplates: async () => {
    set({ templateLoading: true, templateError: '' });
    try {
      const payload = await api.getStrategyTemplates();
      const templates = normalizeTemplates(payload);
      const selectedId = itemId(get().selectedTemplate);
      const selectedTemplate = templates.find((t) => itemId(t) === selectedId) || templates[0] || null;
      set({ templateLoading: false, templates, selectedTemplate, lastUpdated: nowIso() });
    } catch (err) {
      set({ templateLoading: false, templates: [], selectedTemplate: null, templateError: errMsg(err, 'Failed to load templates.') });
    }
  },

  selectTemplate: async (id) => {
    if (!id) return set({ selectedTemplate: null });
    set({ templateLoading: true, templateError: '' });
    try {
      const payload = await api.getStrategyTemplate(id);
      set({ selectedTemplate: normalizeTemplate(payload), templateLoading: false, lastUpdated: nowIso() });
    } catch (err) {
      set({ templateLoading: false, templateError: errMsg(err, 'Failed to load template.') });
    }
  },

  createFromTemplate: async (id, overrides = {}) => {
    const templateId = id || itemId(get().selectedTemplate);
    if (!templateId) return set({ templateError: 'Select a template first.' });
    set({ templateLoading: true, templateError: '', error: '' });
    try {
      const payload = await api.createRuleSetFromTemplate(templateId, get().symbol, overrides);
      const created = hydrateRuleSet(normalizeCreated(payload));
      await get().loadRuleSets();
      const createdId = itemId(created);
      if (createdId) await get().selectRuleSet(createdId);
      else {
        const hydrated = hydrateRuleSet({ ...createDraftRuleSet(get().symbol), ...created });
        set({ draftRuleSet: hydrated, draftValidationErrors: validateDraftRuleSet(hydrated) });
      }
      set({ templateLoading: false, lastUpdated: nowIso() });
    } catch (err) {
      set({ templateLoading: false, templateError: errMsg(err, 'Failed to create rule set from template.') });
    }
  },

  clearTemplateError: () => set({ templateError: '' }),
  clearError: () => set({ error: '' }),
}));
