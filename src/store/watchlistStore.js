import { create } from 'zustand';

const STORAGE_KEY = 'institutional_watchlists';

function loadWatchlists() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

export const useWatchlistStore = create((set) => ({
  watchlists: loadWatchlists(),

  saveWatchlists: (watchlists) => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(watchlists)
    );

    set({ watchlists });
  },
}));
