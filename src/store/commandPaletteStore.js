import { create } from 'zustand';

export const useCommandPaletteStore = create((set) => ({
  open: false,
  query: '',
  selectedIndex: 0,

  openPalette: () => set({ open: true, query: '', selectedIndex: 0 }),

  closePalette: () => set({ open: false, query: '' }),

  setQuery: (q) => set({ query: q, selectedIndex: 0 }),

  moveUp: () =>
    set((s) => ({ selectedIndex: Math.max(0, s.selectedIndex - 1) })),

  moveDown: (max) =>
    set((s) => ({ selectedIndex: Math.min(max - 1, s.selectedIndex + 1) })),
}));
