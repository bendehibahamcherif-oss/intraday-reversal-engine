import { create } from 'zustand';
import { api } from '../api.js';

// Alert types that require a numeric threshold
export const THRESHOLD_TYPES = new Set([
  'price_above', 'price_below', 'price_cross',
  'rsi_above', 'rsi_below',
  'volume_spike', 'relative_volume_spike',
]);

// Alert types that require params.emaPeriod
export const EMA_PERIOD_TYPES = new Set([
  'price_above_ema', 'price_below_ema',
]);

export const ALERT_TYPE_GROUPS = [
  {
    label: 'PRICE',
    types: [
      { value: 'price_above',      label: 'Price Above' },
      { value: 'price_below',      label: 'Price Below' },
      { value: 'price_cross',      label: 'Price Cross' },
    ],
  },
  {
    label: 'RSI',
    types: [
      { value: 'rsi_above',        label: 'RSI Above' },
      { value: 'rsi_below',        label: 'RSI Below' },
    ],
  },
  {
    label: 'EMA',
    types: [
      { value: 'ema_bullish_cross',  label: 'EMA Bullish Cross' },
      { value: 'ema_bearish_cross',  label: 'EMA Bearish Cross' },
      { value: 'price_above_ema',    label: 'Price Above EMA' },
      { value: 'price_below_ema',    label: 'Price Below EMA' },
    ],
  },
  {
    label: 'VWAP',
    types: [
      { value: 'vwap_cross_up',    label: 'VWAP Cross Up' },
      { value: 'vwap_cross_down',  label: 'VWAP Cross Down' },
    ],
  },
  {
    label: 'VOLUME PROFILE',
    types: [
      { value: 'poc_touch',  label: 'POC Touch' },
      { value: 'poc_break',  label: 'POC Break' },
      { value: 'vah_touch',  label: 'VAH Touch' },
      { value: 'vah_break',  label: 'VAH Break' },
      { value: 'val_touch',  label: 'VAL Touch' },
      { value: 'val_break',  label: 'VAL Break' },
    ],
  },
  {
    label: 'VOLUME',
    types: [
      { value: 'volume_spike',          label: 'Volume Spike' },
      { value: 'relative_volume_spike', label: 'Relative Volume Spike' },
    ],
  },
];

// Polling interval refs
let _alertPoll = null;
let _historyPoll = null;
let _firstHistoryPoll = true;
let _lastSeenTriggeredAt = null;

export const useAlertStore = create((set, get) => ({
  alerts: [],
  history: [],
  diagnostics: {},
  loading: false,
  error: null,
  toasts: [],

  // ── CRUD ────────────────────────────────────────────────────────────────────

  loadAlerts: async (symbol) => {
    set({ loading: true, error: null });
    try {
      const data = await api.getAlerts(symbol);
      const alerts = Array.isArray(data?.alerts) ? data.alerts
        : Array.isArray(data) ? data : [];
      set({ alerts, loading: false });
    } catch (err) {
      set({ loading: false, error: err?.message || 'Failed to load alerts' });
    }
  },

  createAlert: async (payload) => {
    set({ loading: true, error: null });
    try {
      const data = await api.createAlert(payload);
      const newAlert = data?.alert || data;
      set((s) => ({ alerts: [newAlert, ...s.alerts], loading: false }));
      return newAlert;
    } catch (err) {
      set({ loading: false, error: err?.message || 'Failed to create alert' });
      throw err;
    }
  },

  updateAlert: async (id, updates) => {
    try {
      const data = await api.updateAlert(id, updates);
      const updated = data?.alert || data;
      set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, ...updated } : a)) }));
    } catch (err) {
      set({ error: err?.message || 'Failed to update alert' });
      throw err;
    }
  },

  deleteAlert: async (id) => {
    // Optimistic remove
    set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) }));
    try {
      await api.deleteAlert(id);
    } catch (err) {
      set({ error: err?.message || 'Failed to delete alert' });
      await get().loadAlerts();
    }
  },

  enableAlert: async (id) => {
    set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, enabled: true } : a)) }));
    try {
      await api.enableAlert(id);
    } catch (err) {
      set({ error: err?.message || 'Failed to enable alert' });
      await get().loadAlerts();
    }
  },

  disableAlert: async (id) => {
    set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, enabled: false } : a)) }));
    try {
      await api.disableAlert(id);
    } catch (err) {
      set({ error: err?.message || 'Failed to disable alert' });
      await get().loadAlerts();
    }
  },

  loadHistory: async (alertId, limit = 50) => {
    try {
      const data = await api.getAlertHistory({ alertId, limit });
      const history = Array.isArray(data?.history) ? data.history
        : Array.isArray(data) ? data : [];
      set({ history });
    } catch (err) {
      console.warn('[alertStore] history load failed', err?.message);
    }
  },

  loadDiagnostics: async () => {
    try {
      const data = await api.getAlertDiagnostics();
      set({ diagnostics: data || {} });
    } catch (err) {
      console.warn('[alertStore] diagnostics load failed', err?.message);
    }
  },

  // ── Toast management ────────────────────────────────────────────────────────

  addToast: (toast) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => get().dismissToast(id), 5000);
  },

  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  // ── Polling ─────────────────────────────────────────────────────────────────

  startPolling: () => {
    if (_alertPoll) return; // idempotent

    // Reload full alert list every 60s (enable/disable sync)
    _alertPoll = setInterval(() => {
      get().loadAlerts();
    }, 60000);

    // Poll history every 15s — detect new triggers → show toast
    const pollHistory = async () => {
      try {
        const data = await api.getAlertHistory({ limit: 10 });
        const history = Array.isArray(data?.history) ? data.history
          : Array.isArray(data) ? data : [];

        if (_firstHistoryPoll) {
          // On first poll: record current head, never show toast for old entries
          _firstHistoryPoll = false;
          _lastSeenTriggeredAt = history[0]?.triggeredAt ?? null;
          return;
        }

        // Find entries newer than last seen
        const newEntries = _lastSeenTriggeredAt
          ? history.filter((h) => h.triggeredAt > _lastSeenTriggeredAt)
          : [];

        if (newEntries.length) {
          _lastSeenTriggeredAt = newEntries[0].triggeredAt;
          newEntries.forEach((h) => {
            get().addToast({
              symbol: h.symbol,
              type: h.type,
              triggerValue: h.triggerValue,
              reason: h.reason,
              triggeredAt: h.triggeredAt,
            });
          });
          // Refresh history in store
          get().loadHistory(undefined, 50);
        }
      } catch (err) {
        console.warn('[alertStore] history poll failed', err?.message);
      }
    };

    pollHistory(); // immediate first poll
    _historyPoll = setInterval(pollHistory, 15000);

    // Initial loads
    get().loadAlerts();
    get().loadDiagnostics();
    get().loadHistory(undefined, 50);
  },

  stopPolling: () => {
    clearInterval(_alertPoll);
    clearInterval(_historyPoll);
    _alertPoll = null;
    _historyPoll = null;
    _firstHistoryPoll = true;
  },
}));
