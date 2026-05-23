import { create } from 'zustand';

const generateMockReplayData = () => {
  return Array.from({ length: 200 }).map((_, i) => ({
    time: `09:${String(i % 60).padStart(2, '0')}`,
    open: 5200 + i * 0.8,
    high: 5205 + i * 0.9,
    low: 5195 + i * 0.7,
    close: 5200 + i,
    volume: 1000 + i * 15,
  }));
};

export const useReplayStore = create((set, get) => ({
  replayMode: false,
  replayData: generateMockReplayData(),
  replayIndex: 0,
  playbackSpeed: 1,
  playing: false,
  playbackTimer: null,

  setReplayMode: (replayMode) =>
    set({ replayMode }),

  loadReplayData: (replayData) =>
    set({ replayData, replayIndex: 0 }),

  setPlaybackSpeed: (playbackSpeed) => {
    set({ playbackSpeed });

    if (get().playing) {
      get().pauseReplay();
      get().playReplay();
    }
  },

  stepReplay: () =>
    set((state) => ({
      replayIndex: Math.min(
        state.replayIndex + 1,
        state.replayData.length - 1
      ),
    })),

  previousCandle: () =>
    set((state) => ({
      replayIndex: Math.max(
        state.replayIndex - 1,
        0
      ),
    })),

  resetReplay: () =>
    set({
      replayIndex: 0,
      playing: false,
    }),

  playReplay: () => {
    const speed = get().playbackSpeed;

    const timer = setInterval(() => {
      const state = get();

      if (
        state.replayIndex >=
        state.replayData.length - 1
      ) {
        clearInterval(state.playbackTimer);

        set({
          playing: false,
          playbackTimer: null,
        });

        return;
      }

      state.stepReplay();
    }, 1000 / speed);

    set({
      playing: true,
      playbackTimer: timer,
    });
  },

  pauseReplay: () => {
    const timer = get().playbackTimer;

    if (timer) {
      clearInterval(timer);
    }

    set({
      playing: false,
      playbackTimer: null,
    });
  },

  currentCandle: () => {
    const state = get();

    return (
      state.replayData[
        state.replayIndex
      ] || null
    );
  },
}));
