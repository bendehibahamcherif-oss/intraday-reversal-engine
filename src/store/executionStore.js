import { create } from 'zustand';
import { api } from '../api.js';
import wsClient from '../services/wsClient.js';

const errMsg = (e) => e?.message || 'Execution error';

const toList = (payload, key) => {
  if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload)) return payload;
  return [];
};

function genClientOrderId() {
  return `clt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export const useExecutionStore = create((set, get) => ({
  // ── Mode ──────────────────────────────────────────────────────────────────
  mode: 'paper',
  // Phase 12 gate: live routing stays locked until OMS reconciliation is complete.
  liveUnlocked: false,

  // ── Order ticket state ────────────────────────────────────────────────────
  ticket: {
    symbol:        'SPY',
    side:          'buy',
    orderType:     'market',
    quantity:      1,
    limitPrice:    '',
    stopPrice:     '',
    clientOrderId: '',
  },

  // ── Server data ───────────────────────────────────────────────────────────
  orders:    [],
  fills:     [],
  analytics: null,

  // ── Pre-trade risk check ──────────────────────────────────────────────────
  riskCheck:        null,
  riskCheckLoading: false,
  riskCheckError:   '',

  // ── Loading / error ───────────────────────────────────────────────────────
  ordersLoading:    false,
  ordersError:      '',
  fillsLoading:     false,
  fillsError:       '',
  analyticsLoading: false,
  analyticsError:   '',
  placing:          false,
  placeError:       '',

  // ── Setters ───────────────────────────────────────────────────────────────
  setMode: (next) => {
    if (next === 'live' && !get().liveUnlocked) return; // Phase 12 hard gate
    set({ mode: next });
  },
  setTicket: (updates) => set((s) => ({ ticket: { ...s.ticket, ...updates }, riskCheck: null, placeError: '' })),
  clearErrors: () => set({ ordersError: '', fillsError: '', analyticsError: '', placeError: '', riskCheckError: '' }),

  // ── Pre-trade risk check ──────────────────────────────────────────────────
  runRiskCheck: async () => {
    const { ticket, mode } = get();
    set({ riskCheckLoading: true, riskCheckError: '', riskCheck: null });
    try {
      const payload = await api.preTradeRiskCheck(ticket, mode);
      set({ riskCheck: payload?.check ?? payload ?? null, riskCheckLoading: false });
    } catch (e) {
      set({ riskCheckLoading: false, riskCheckError: errMsg(e) });
    }
  },

  // ── Place order ───────────────────────────────────────────────────────────
  placeOrder: async () => {
    const { ticket, mode, liveUnlocked } = get();
    if (mode === 'live' && !liveUnlocked) return; // double-guard
    set({ placing: true, placeError: '' });
    try {
      const orderPayload = {
        ...ticket,
        clientOrderId: ticket.clientOrderId || genClientOrderId(),
        limitPrice:  ticket.limitPrice  !== '' ? Number(ticket.limitPrice)  : undefined,
        stopPrice:   ticket.stopPrice   !== '' ? Number(ticket.stopPrice)   : undefined,
      };
      const payload = await api.placeOrder(orderPayload, mode);
      const order = payload?.order ?? payload ?? null;
      if (order) set((s) => ({ orders: [order, ...s.orders] }));
      set({ placing: false, riskCheck: null });
      await get().loadOrders();
    } catch (e) {
      set({ placing: false, placeError: errMsg(e) });
    }
  },

  // ── Cancel order ──────────────────────────────────────────────────────────
  cancelOrder: async (orderId) => {
    const { mode } = get();
    try {
      await api.cancelExecutionOrder(orderId, mode);
      await get().loadOrders();
    } catch (e) {
      set({ ordersError: errMsg(e) });
    }
  },

  // ── Load data ─────────────────────────────────────────────────────────────
  loadOrders: async () => {
    const { mode, ticket } = get();
    set({ ordersLoading: true, ordersError: '' });
    try {
      const payload = await api.getExecutionOrders({ mode, symbol: ticket.symbol || undefined });
      set({ orders: toList(payload, 'orders'), ordersLoading: false });
    } catch (e) {
      set({ ordersLoading: false, ordersError: errMsg(e) });
    }
  },

  loadFills: async () => {
    const { mode, ticket } = get();
    set({ fillsLoading: true, fillsError: '' });
    try {
      const payload = await api.getExecutionFills({ mode, symbol: ticket.symbol || undefined });
      set({ fills: toList(payload, 'fills'), fillsLoading: false });
    } catch (e) {
      set({ fillsLoading: false, fillsError: errMsg(e) });
    }
  },

  loadAnalytics: async () => {
    const { mode, ticket } = get();
    set({ analyticsLoading: true, analyticsError: '' });
    try {
      const payload = await api.getExecutionAnalytics({ mode, symbol: ticket.symbol || undefined });
      set({ analytics: payload?.analytics ?? payload ?? null, analyticsLoading: false });
    } catch (e) {
      set({ analyticsLoading: false, analyticsError: errMsg(e) });
    }
  },

  refreshAll: () => {
    const s = get();
    s.loadOrders();
    s.loadFills();
    s.loadAnalytics();
  },

  // ── WS order_update handler ───────────────────────────────────────────────
  handleWsMessage: (msg) => {
    if (msg?.type !== 'order_update') return;
    const update = msg?.order;
    if (!update) return;
    set((state) => {
      const uid = update.orderId || update.id || update.clientOrderId;
      const matched = state.orders.some((o) => (o.orderId || o.id || o.clientOrderId) === uid);
      const orders = matched
        ? state.orders.map((o) => ((o.orderId || o.id || o.clientOrderId) === uid ? { ...o, ...update } : o))
        : [update, ...state.orders];
      return { orders };
    });
    if (msg?.fill) {
      set((s) => ({ fills: [msg.fill, ...s.fills] }));
    }
  },

  // Backward-compat for existing components that call addOrder / addFill
  addOrder: (order) => set((s) => ({ orders: [order, ...s.orders] })),
  addFill:  (fill)  => set((s) => ({ fills:  [fill,  ...s.fills]  })),
}));

// ── Module-level WS wiring ────────────────────────────────────────────────────
wsClient.onMessage((msg) => useExecutionStore.getState().handleWsMessage(msg));
wsClient.onConnect(() => wsClient.subscribe('order_updates'));
