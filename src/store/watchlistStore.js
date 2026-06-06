import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const DEFAULT_WATCHLIST = ['SPY', 'BTC-USD', 'EURUSD=X'];

const safeJsonStorage = {
  getItem: (name) => { try { return localStorage.getItem(name); } catch { return null; } },
  setItem: (name, value) => { try { localStorage.setItem(name, value); } catch {} },
  removeItem: (name) => { try { localStorage.removeItem(name); } catch {} },
};

export function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

export const useWatchlistStore = create(
  persist(
    (set, get) => ({
      watchlist: DEFAULT_WATCHLIST,

      addSymbol: (rawSymbol) => {
        const symbol = normalizeSymbol(rawSymbol);
        if (!symbol) return false;
        if (get().watchlist.includes(symbol)) return false;
        set((state) => ({ watchlist: [...state.watchlist, symbol] }));
        return true;
      },

      removeSymbol: (rawSymbol) => {
        const symbol = normalizeSymbol(rawSymbol);
        set((state) => ({ watchlist: state.watchlist.filter((item) => item !== symbol) }));
      },

      setWatchlist: (symbols = []) => {
        const deduped = [];
        symbols.forEach((item) => {
          const symbol = normalizeSymbol(item);
          if (symbol && !deduped.includes(symbol)) deduped.push(symbol);
        });
        set({ watchlist: deduped.length ? deduped : DEFAULT_WATCHLIST });
      },
    }),
    {
      name: 'terminal_watchlist_v2',
      version: 2,
      storage: createJSONStorage(() => safeJsonStorage),
      merge: (persistedState, currentState) => {
        const raw = Array.isArray(persistedState?.watchlist) ? persistedState.watchlist : DEFAULT_WATCHLIST;
        const deduped = [];
        raw.forEach((item) => { const symbol = normalizeSymbol(item); if (symbol && !deduped.includes(symbol)) deduped.push(symbol); });
        return { ...currentState, watchlist: deduped.length ? deduped : DEFAULT_WATCHLIST };
      },
      partialize: (state) => ({ watchlist: state.watchlist }),
    }
  )
);
