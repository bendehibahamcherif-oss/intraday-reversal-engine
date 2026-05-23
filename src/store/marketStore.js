import { create } from 'zustand';

export const useMarketStore = create((set) => ({
  prices: {},
  signals: [],
  regime: 'neutral',

  updatePrice: (symbol, price) =>
    set((state) => ({
      prices: {
        ...state.prices,
        [symbol]: price,
      },
    })),

  setSignals: (signals) => set({ signals }),

  setRegime: (regime) => set({ regime }),
}));
