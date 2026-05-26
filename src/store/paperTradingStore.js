import { create } from 'zustand';
import { api } from '../api';

const defaultTicket = {
  side: 'BUY',
  type: 'MARKET',
  quantity: 1,
  requestedPrice: '',
  strategyId: '',
};

function extractItems(payload, fallbackKeys = []) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of fallbackKeys) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
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
      quantity: Number(orderTicket.quantity),
    };

    if (orderTicket.requestedPrice !== '' && orderTicket.requestedPrice !== null) {
      order.requestedPrice = Number(orderTicket.requestedPrice);
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
      set({ orders: extractItems(payload, ['orders', 'data']), loading: false, lastUpdated: new Date().toISOString() });
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
      set({ fills: extractItems(payload, ['fills', 'data']), loading: false, lastUpdated: new Date().toISOString() });
    } catch (err) {
      set({ loading: false, error: err.message || 'Failed to load fills', fills: [] });
    }
  },

  loadPositions: async () => {
    set({ loading: true, error: null });
    try {
      const payload = await api.getPaperPositions();
      const positions = extractItems(payload, ['positions', 'data']);
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
      set({ riskStatus, loading: false, lastUpdated: new Date().toISOString() });
    } catch (err) {
      set({ loading: false, error: err.message || 'Failed to load risk status', riskStatus: null });
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
