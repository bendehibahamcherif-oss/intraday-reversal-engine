import { create } from 'zustand';
import { api } from '../api.js';
import wsClient from '../services/wsClient.js';

const errMsg = (e) => e?.message || 'OMS error';

const toList = (payload, key) => {
  if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload)) return payload;
  return [];
};

export const OMS_TERMINAL = new Set(['FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED']);

export const useOMSStore = create((set, get) => ({
  // ── Orders ──────────────────────────────────────────────────────────────────
  orders: [],
  ordersLoading: false,
  ordersError: '',

  // ── Selected order + event journal ──────────────────────────────────────────
  selectedOrderId: null,
  events: [],
  eventsLoading: false,
  eventsError: '',

  // ── Reconciliation ───────────────────────────────────────────────────────────
  reconciliation: null,
  reconciliationLoading: false,
  reconciliationError: '',
  reconciliationRunning: false,
  reconciliationRunError: '',

  // ── Stats ────────────────────────────────────────────────────────────────────
  stats: null,
  statsLoading: false,
  statsError: '',

  // ── Filters ──────────────────────────────────────────────────────────────────
  filterSymbol: '',
  filterStatus: '',

  // ── Setters ──────────────────────────────────────────────────────────────────
  setFilterSymbol: (v) => set({ filterSymbol: v }),
  setFilterStatus: (v) => set({ filterStatus: v }),
  clearErrors: () => set({ ordersError: '', eventsError: '', reconciliationError: '', reconciliationRunError: '', statsError: '' }),

  selectOrder: async (orderId) => {
    set({ selectedOrderId: orderId, events: [], eventsError: '' });
    if (orderId) await get().loadEvents(orderId);
  },

  // ── Load OMS orders ──────────────────────────────────────────────────────────
  loadOrders: async () => {
    const { filterSymbol, filterStatus } = get();
    set({ ordersLoading: true, ordersError: '' });
    try {
      const payload = await api.getOMSOrders({
        symbol: filterSymbol || undefined,
        status: filterStatus || undefined,
      });
      set({ orders: toList(payload, 'orders'), ordersLoading: false });
    } catch (e) {
      set({ ordersLoading: false, ordersError: errMsg(e) });
    }
  },

  // ── Load event journal for an order ─────────────────────────────────────────
  loadEvents: async (orderId) => {
    set({ eventsLoading: true, eventsError: '', events: [] });
    try {
      const payload = await api.getOMSOrderEvents(orderId);
      set({ events: toList(payload, 'events'), eventsLoading: false });
    } catch (e) {
      set({ eventsLoading: false, eventsError: errMsg(e) });
    }
  },

  // ── Run reconciliation ───────────────────────────────────────────────────────
  runReconciliation: async () => {
    set({ reconciliationRunning: true, reconciliationRunError: '' });
    try {
      const payload = await api.runOMSReconciliation();
      set({ reconciliation: payload?.reconciliation ?? payload ?? null, reconciliationRunning: false });
      await get().loadOrders();
    } catch (e) {
      set({ reconciliationRunning: false, reconciliationRunError: errMsg(e) });
    }
  },

  // ── Load last reconciliation result ─────────────────────────────────────────
  loadReconciliation: async () => {
    set({ reconciliationLoading: true, reconciliationError: '' });
    try {
      const payload = await api.getOMSReconciliation();
      set({ reconciliation: payload?.reconciliation ?? payload ?? null, reconciliationLoading: false });
    } catch (e) {
      set({ reconciliationLoading: false, reconciliationError: errMsg(e) });
    }
  },

  // ── Load stats ───────────────────────────────────────────────────────────────
  loadStats: async () => {
    set({ statsLoading: true, statsError: '' });
    try {
      const payload = await api.getOMSStats();
      set({ stats: payload?.stats ?? payload ?? null, statsLoading: false });
    } catch (e) {
      set({ statsLoading: false, statsError: errMsg(e) });
    }
  },

  // ── Refresh all ──────────────────────────────────────────────────────────────
  refreshAll: () => {
    const s = get();
    s.loadOrders();
    s.loadReconciliation();
    s.loadStats();
  },

  // ── WS handler ───────────────────────────────────────────────────────────────
  handleWsMessage: (msg) => {
    if (msg?.type === 'oms_event') {
      const event = msg?.event;
      const order = msg?.order;

      if (order) {
        set((state) => {
          const uid = order.orderId || order.id || order.clientOrderId;
          const matched = state.orders.some((o) => (o.orderId || o.id || o.clientOrderId) === uid);
          const orders = matched
            ? state.orders.map((o) => ((o.orderId || o.id || o.clientOrderId) === uid ? { ...o, ...order } : o))
            : [order, ...state.orders];
          return { orders };
        });
      }

      if (event) {
        const { selectedOrderId } = get();
        const eventOrderId = event.orderId || event.order_id;
        if (selectedOrderId && eventOrderId === selectedOrderId) {
          set((s) => ({ events: [...s.events, event] }));
        }
      }
    }

    if (msg?.type === 'oms_reconciliation') {
      const rec = msg?.reconciliation ?? msg?.data ?? null;
      if (rec) set({ reconciliation: rec });
    }
  },
}));

// Module-level WS wiring
wsClient.onMessage((msg) => useOMSStore.getState().handleWsMessage(msg));
wsClient.onConnect(() => {
  wsClient.subscribe('oms_events');
  wsClient.subscribe('oms_reconciliation');
});
