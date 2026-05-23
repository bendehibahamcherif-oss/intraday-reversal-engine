import { create } from 'zustand';

import wsClient from '../services/wsClient';

export const useSocketStore = create((set, get) => ({
  connected: false,
  latency: null,
  lastMessageTs: null,
  stale: false,
  subscriptions: [],
  messages: [],

  initialize: () => {
    wsClient.onMessage((message) => {
      if (message.type === 'pong') {
        set({
          latency: Date.now() - message.ts,
        });
      }

      set((state) => ({
        lastMessageTs: Date.now(),
        stale: false,
        messages: [message, ...state.messages].slice(0, 250),
      }));
    });

    setInterval(() => {
      const last = get().lastMessageTs;

      if (last && Date.now() - last > 15000) {
        set({ stale: true });
      }
    }, 5000);
  },

  subscribe: (channel) => {
    wsClient.subscribe(channel);

    set((state) => ({
      subscriptions: [...new Set([...state.subscriptions, channel])],
    }));
  },
}));
