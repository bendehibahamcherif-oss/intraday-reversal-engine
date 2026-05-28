import { create } from 'zustand';
import wsClient from '../services/wsClient.js';
import { useMarketRuntimeStore } from './marketRuntimeStore.js';

const DEFAULT_SYMBOL = 'SPY';

function normalizeSymbol(v) {
  return String(v || '').trim().toUpperCase() || DEFAULT_SYMBOL;
}

export const useActiveSymbolStore = create((set, get) => ({
  symbol: DEFAULT_SYMBOL,
  _wsSubscribed: new Set(),

  setSymbol: (raw) => {
    const next = normalizeSymbol(raw);
    const prev = get().symbol;
    if (next === prev) return;
    console.debug('[activeSymbol] symbol changed', { from: prev, to: next });
    set({ symbol: next });
    // Backend subscription lifecycle: subscribe new, unsubscribe old (best-effort, 404-tolerant).
    try {
      const rts = useMarketRuntimeStore.getState();
      rts.subscribeSymbol(next);
      // Only unsubscribe prev if it's not still in the WS subscription set
      // (other watchlist items remain subscribed via App.jsx watchlist effect)
      if (prev && prev !== next) {
        rts.unsubscribeSymbol(prev);
        console.debug('[activeSymbol] backend unsubscribe scheduled', { prev });
      }
    } catch (e) {
      console.debug('[activeSymbol] backend subscription lifecycle error', e?.message);
    }
  },

  subscribeWs: (sym) => {
    const s = normalizeSymbol(sym);
    const subscribed = get()._wsSubscribed;
    if (subscribed.has(s)) return;
    wsClient.subscribe(`market:${s}`);
    wsClient.subscribe(`orderbook:${s}`);
    wsClient.subscribe(`replay:${s}`);
    const next = new Set(subscribed);
    next.add(s);
    set({ _wsSubscribed: next });
    console.debug('[activeSymbol] ws subscribed', { symbol: s });
  },

  unsubscribeWs: (sym) => {
    const s = normalizeSymbol(sym);
    const subscribed = get()._wsSubscribed;
    if (!subscribed.has(s)) return;
    wsClient.unsubscribe(`market:${s}`);
    wsClient.unsubscribe(`orderbook:${s}`);
    wsClient.unsubscribe(`replay:${s}`);
    const next = new Set(subscribed);
    next.delete(s);
    set({ _wsSubscribed: next });
    console.debug('[activeSymbol] ws unsubscribed', { symbol: s });
  },
}));
