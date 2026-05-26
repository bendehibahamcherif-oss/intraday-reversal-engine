import { create } from 'zustand';
import { api } from '../api';

const defaultTicket = {
  side: 'BUY',
  type: 'MARKET',
  quantity: 1,
  requestedPrice: '',
  strategyId: '',
};

const DEFAULT_RISK_STATUS = {
  killSwitchEnabled: false,
  killSwitchActive: false,
  message: 'Risk status unavailable',
};

export function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

export function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function valueOrDash(value) {
  return value === null || value === undefined || value === '' ? '-' : value;
}

export function normalizePaperResponse(payload) {
  const response = payload && typeof payload === 'object' ? payload : {};
  const orders = Array.isArray(response.orders) ? response.orders : toArray(response.orders ?? response.data ?? payload).filter((item) => item && typeof item === 'object');
  const fills = Array.isArray(response.fills) ? response.fills : toArray(response.fills ?? response.data ?? payload).filter((item) => item && typeof item === 'object');
  const positions = Array.isArray(response.positions) ? response.positions : toArray(response.positions ?? response.data ?? payload).filter((item) => item && typeof item === 'object');
  const riskStatusInput = response.riskStatus ?? payload;
  const riskStatus = riskStatusInput && typeof riskStatusInput === 'object'
    ? { ...DEFAULT_RISK_STATUS, ...riskStatusInput }
    : { ...DEFAULT_RISK_STATUS };

  return { orders, fills, positions, riskStatus };
}

export const usePaperTradingStore = create((set, get) => ({
  symbol: 'SPY',
  orders: [],
  fills: [],
  positions: [],
  selectedPosition: null,
  riskStatus: null,
  orderTicket: { ...defaultTicket },
  loading: false,
  error: null,
  lastUpdated: null,

  setSymbol: (symbol) => set({ symbol: (symbol || '').toUpperCase().trim() }),
  updateOrderTicket: (field, value) => set((state) => ({ orderTicket: { ...state.orderTicket, [field]: value } })),
  clearError: () => set({ error: null }),

  placeOrder: async () => {
    const { symbol, orderTicket } = get();
    const cleanSymbol = (symbol || '').trim().toUpperCase();
    if (!cleanSymbol) return set({ error: 'Symbol is required' });

    const order = {
      symbol: cleanSymbol,
      side: orderTicket.side,
      type: orderTicket.type,
      quantity: safeNumber(orderTicket.quantity, 1),
    };

    if (orderTicket.requestedPrice !== '' && orderTicket.requestedPrice !== null) {
      order.requestedPrice = safeNumber(orderTicket.requestedPrice, 0);
    }
    if (orderTicket.strategyId?.trim()) order.strategyId = orderTicket.strategyId.trim();

    set({ loading: true, error: null });
    try {
      const res = await api.placePaperOrder(order);
      await get().refreshAll();
      set({
        loading: false,
        orderTicket: { ...defaultTicket },
        error: res?.pricingMode === 'demo' ? 'Order filled with demo/fallback pricing.' : null,
      });
      return res;
    } catch (err) {
      set({ loading: false, error: err.message || 'Failed to place paper order' });
      return null;
    }
  },

  loadOrders: async () => {
    set({ loading: true, error: null });
    try {
      const payload = await api.getPaperOrders(get().symbol);
      const normalized = normalizePaperResponse(payload);
      set({ orders: normalized.orders, loading: false, lastUpdated: new Date().toISOString() });
    } catch (err) {
      set({ loading: false, error: err.message || 'Failed to load orders', orders: [] });
    }
  },

  cancelOrder: async (orderId) => {
    set({ loading: true, error: null });
    try {
      await api.cancelPaperOrder(orderId);
      await get().loadOrders();
      set({ loading: false });
    } catch (err) {
      set({ loading: false, error: err.message || 'Failed to cancel order' });
    }
  },

  loadFills: async () => {
    set({ loading: true, error: null });
    try {
      const payload = await api.getPaperFills(get().symbol);
      const normalized = normalizePaperResponse(payload);
      set({ fills: normalized.fills, loading: false, lastUpdated: new Date().toISOString() });
    } catch (err) {
      set({ loading: false, error: err.message || 'Failed to load fills', fills: [] });
    }
  },

  loadPositions: async () => {
    set({ loading: true, error: null });
    try {
      const payload = await api.getPaperPositions();
      const normalized = normalizePaperResponse(payload);
      const positions = normalized.positions;
      const selectedSymbol = get().selectedPosition?.symbol;
      set({
        positions,
        selectedPosition: selectedSymbol ? positions.find((p) => p.symbol === selectedSymbol) || null : null,
        loading: false,
        lastUpdated: new Date().toISOString(),
      });
    } catch (err) {
      set({ loading: false, error: err.message || 'Failed to load positions', positions: [] });
    }
  },

  closePosition: async (symbol) => {
    set({ loading: true, error: null });
    try {
      await api.closePaperPosition(symbol);
      await get().refreshAll();
      set({ loading: false });
    } catch (err) {
      set({ loading: false, error: err.message || 'Failed to close position' });
    }
  },

  loadRiskStatus: async () => {
    set({ loading: true, error: null });
    try {
      const riskStatus = await api.getPaperRiskStatus();
      const normalized = normalizePaperResponse({ riskStatus });
      set({ riskStatus: normalized.riskStatus, loading: false, lastUpdated: new Date().toISOString() });
    } catch (err) {
      set({ loading: false, error: err.message || 'Failed to load risk status', riskStatus: { ...DEFAULT_RISK_STATUS } });
    }
  },

  enableKillSwitch: async () => {
    set({ loading: true, error: null });
    try {
      await api.enablePaperKillSwitch();
      await get().loadRiskStatus();
      set({ loading: false });
    } catch (err) {
      set({ loading: false, error: err.message || 'Failed to enable kill switch' });
    }
  },

  disableKillSwitch: async () => {
    set({ loading: true, error: null });
    try {
      await api.disablePaperKillSwitch();
      await get().loadRiskStatus();
      set({ loading: false });
    } catch (err) {
      set({ loading: false, error: err.message || 'Failed to disable kill switch' });
    }
  },

  resetAccount: async () => {
    set({ loading: true, error: null });
    try {
      await api.resetPaperAccount();
      await get().refreshAll();
      set({ loading: false });
    } catch (err) {
      set({ loading: false, error: err.message || 'Failed to reset paper account' });
    }
  },

  refreshAll: async () => {
    await Promise.all([
      get().loadOrders(),
      get().loadFills(),
      get().loadPositions(),
      get().loadRiskStatus(),
    ]);
  },
}));
