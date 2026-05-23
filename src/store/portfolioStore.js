import { create } from 'zustand';

export const usePortfolioStore = create((set) => ({
  positions: [],
  pnl: 0,
  exposure: {
    gross: 0,
    net: 0,
    long: 0,
    short: 0,
  },

  setPositions: (positions) =>
    set({ positions }),

  setPnL: (pnl) => set({ pnl }),

  setExposure: (exposure) =>
    set({ exposure }),
}));
