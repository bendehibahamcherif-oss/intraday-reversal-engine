import { create } from 'zustand';

export const useExecutionStore = create((set) => ({
  orders: [],
  fills: [],

  addOrder: (order) =>
    set((state) => ({
      orders: [order, ...state.orders],
    })),

  addFill: (fill) =>
    set((state) => ({
      fills: [fill, ...state.fills],
    })),
}));
