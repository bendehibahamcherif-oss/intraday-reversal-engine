import { create } from 'zustand';

import { api } from '../api';

const fallbackReplayData = () => {
  const now = Date.now();

  return Array.from({ length: 120 }).map((_, i) => ({
    time: new Date(now - (120 - i) * 60_000).toISOString(),
    open: 5200 + i * 0.8,
    high: 5205 + i * 0.9,
    low: 5195 + i * 0.7,
    close: 5200 + i,
    volume: 1000 + i * 15,
  }));
};

export const useReplayStore = create((set, get) => ({
  replayMode: false,
  replayData: fallbackReplayData(),
  replayIndex: 0,
  playbackSpeed: 1,
  playing: false,
  sessionId: null,
  symbol: 'SPX',
  backendAvailable: true,
  backendHealthLastUrl: '',
  backendHealthLastError: '',
  backendHealthLastResponse: null,

  checkBackendHealth: async () => {
    const healthUrl = `${api.base}/api/runtime/health`;

    if (import.meta.env.DEV) {
      console.info('[Replay] runtime health URL:', healthUrl);
    }

    set({ backendHealthLastUrl: healthUrl });

    try {
      const result = await api.runtimeHealth();
      const backendAvailable = Boolean(
        result?._httpOk === true && (result?.ok === true || result?.runtime === 'active')
      );

      set({
        backendAvailable,
        backendHealthLastUrl: result?._url || healthUrl,
        backendHealthLastError: '',
        backendHealthLastResponse: result,
      });
    } catch (err) {
      set({
        backendAvailable: false,
        backendHealthLastUrl: healthUrl,
        backendHealthLastError: err?.message || 'Health request failed',
        backendHealthLastResponse: null,
      });
    }
  },

  setReplayMode: async (replayMode) => {
    set({ replayMode });

    if (!replayMode && get().sessionId) {
      await get().stopReplay();
    }
  },

  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),

  loadReplayData: (replayData) => set({ replayData, replayIndex: 0 }),

  setFromReplayEvent: (payload) => {
    if (!payload) return;

    if (Array.isArray(payload.candles) && payload.candles.length) {
      set({ replayData: payload.candles, replayIndex: payload.index || 0 });
      return;
    }

    if (payload.candle) {
      set((state) => {
        const next = [...state.replayData, payload.candle];

        return {
          replayData: next.slice(-2000),
          replayIndex: Math.max(next.length - 1, 0),
        };
      });
    }
  },

  startReplay: async () => {
    const state = get();

    try {
      const sessionId = state.sessionId || `session-${Date.now()}`;

      await api.replayStart({
        sessionId,
        symbol: state.symbol,
        options: { speed: state.playbackSpeed },
      });

      set({ playing: true, sessionId });
    } catch (err) {
      console.warn('Replay start failed.', err?.message);
      set({ playing: true });
    }
  },

  pauseReplay: async () => {
    const { sessionId } = get();

    try {
      if (sessionId) await api.replayPause(sessionId);
      set({ playing: false });
    } catch {
      set({ playing: false });
    }
  },

  resumeReplay: async () => {
    const { sessionId } = get();

    try {
      if (sessionId) await api.replayResume(sessionId);
      set({ playing: true });
    } catch {
      set({ playing: true });
    }
  },

  stopReplay: async () => {
    const { sessionId } = get();

    try {
      if (sessionId) await api.replayStop(sessionId);
    } catch (err) {
      console.warn('Replay stop failed', err?.message);
    }

    set({ playing: false, replayIndex: 0, sessionId: null });
  },

  currentCandle: () => {
    const state = get();
    return state.replayData[state.replayIndex] || null;
  },
}));
