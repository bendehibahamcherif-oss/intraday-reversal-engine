import { create } from 'zustand';
import wsClient from '../services/wsClient.js';

let _initialized = false;

export const useSocketStore = create((set, get) => ({
  connected: false,
  latency: null,
  lastMessageTs: null,
  stale: false,
  reconnectCount: 0,
  subscriptions: [],
  messages: [],

  initialize: () => {
    if (_initialized) return;
    _initialized = true;

    // Sync connection state immediately if wsClient is already up.
    if (wsClient.connected) {
      set({ connected: true, reconnectCount: wsClient.reconnectCount || 0 });
      console.debug('[socketStore] wsClient already connected at initialize');
    }

    // marketRuntimeStore registers onConnect/onDisconnect at module load.
    // socketStore mirrors connected/reconnectCount from marketRuntimeStore to avoid
    // duplicate WS lifecycle registrations (wsClient listeners are additive/non-deduped).
    // We still need connected state here for components that read socketStore directly.
    wsClient.onConnect((reconnectCount) => {
      set({ connected: true, reconnectCount: reconnectCount ?? wsClient.reconnectCount ?? 0, stale: false });
      console.debug('[socketStore] ws connected', { reconnectCount });
    });

    wsClient.onDisconnect((reconnectCount) => {
      set({ connected: false, reconnectCount: reconnectCount ?? wsClient.reconnectCount ?? 0 });
      console.debug('[socketStore] ws disconnected', { reconnectCount });
    });

    wsClient.onMessage((message) => {
      if (message.type === 'pong') {
        const latency = Date.now() - message.ts;
        set({ latency });
        console.debug('[socketStore] pong latency', { latency });
      }
      set((state) => ({
        lastMessageTs: Date.now(),
        stale: false,
        messages: [message, ...state.messages].slice(0, 250),
      }));
    });

    // Stale-feed watchdog: mark stale if no message in 15s. Single interval, never duplicated.
    setInterval(() => {
      const last = get().lastMessageTs;
      if (last && Date.now() - last > 15000) {
        set({ stale: true });
        console.debug('[socketStore] stale feed detected', { silenceMs: Date.now() - last });
      }
    }, 5000);

    console.debug('[socketStore] initialized');
  },

  subscribe: (channel) => {
    wsClient.subscribe(channel);
    set((state) => ({
      subscriptions: [...new Set([...state.subscriptions, channel])],
    }));
  },
}));
