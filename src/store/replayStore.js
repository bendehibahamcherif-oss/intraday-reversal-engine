import { create } from 'zustand';

export const useReplayStore = create((set) => ({
  replayMode: false,
  replayData: [],
  replayIndex: 0,

  setReplayMode: (replayMode) =>
    set({ replayMode }),

  loadReplayData: (replayData) =>
    set({ replayData, replayIndex: 0 }),

  stepReplay: () =>
    set((state) => ({
      replayIndex:
        state.replayIndex + 1,
    })),
}));
