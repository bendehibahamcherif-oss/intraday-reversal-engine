import { create } from 'zustand';

import wsClient from '../services/wsClient';
import { useReplayStore } from './replayStore';

let _initialized = false;

function buildCandle(existing, tick) {
  if (!existing) {
    return {
      time: tick.time,
      open: tick.price,
      high: tick.price,
      low: tick.price,
      close: tick.price,
      volume: tick.volume || 0,
    };
  }

  return {
    ...existing,
    high: Math.max(existing.high, tick.price),
    low: Math.min(existing.low, tick.price),
    close: tick.price,
    volume: existing.volume + (tick.volume || 0),
  };
}

export const useMarketStore = create((set, get) => ({
  prices: {},
  signals: [],
  regime: 'neutral',
  ticks: [],
  candles1m: {},
  orderBook: {},
  lastSequence: 0,

  initialize: () => {
    if (_initialized) return;
    _initialized = true;
    console.debug('[marketStore] ws listener registered');
    wsClient.onMessage((message) => {
      if (message.type === 'tick') {
        get().processTick(message.payload || message);
      }

      if (message.type === 'candle') {
        get().processCandle(message.payload || message);
      }

      if (message.type === 'orderbook') {
        const symbol = message.symbol || message.payload?.symbol;
        if (!symbol) return;

        set((state) => ({
          orderBook: {
            ...state.orderBook,
            [symbol]: message.payload || message,
          },
        }));
      }

      if (message.type === 'replay') {
        useReplayStore.getState().setFromReplayEvent(message.payload || message);
      }
    });
  },

  processTick: (tick) => {
    const bucket = new Date(tick.time).toISOString().slice(0, 16);

    set((state) => {
      const symbolCandles = state.candles1m[tick.symbol] || {};
      const current = symbolCandles[bucket];

      return {
        prices: {
          ...state.prices,
          [tick.symbol]: tick.price,
        },
        ticks: [tick, ...state.ticks].slice(0, 2000),
        candles1m: {
          ...state.candles1m,
          [tick.symbol]: {
            ...symbolCandles,
            [bucket]: buildCandle(current, tick),
          },
        },
        lastSequence: tick.sequence || state.lastSequence,
      };
    });
  },

  processCandle: (candle) => {
    const symbol = candle.symbol;
    if (!symbol) return;

    const bucket = new Date(candle.time).toISOString().slice(0, 16);

    set((state) => ({
      candles1m: {
        ...state.candles1m,
        [symbol]: {
          ...(state.candles1m[symbol] || {}),
          [bucket]: candle,
        },
      },
    }));
  },

  subscribeSymbol: (symbol) => {
    wsClient.subscribe(`market:${symbol}`);
    wsClient.subscribe(`orderbook:${symbol}`);
    wsClient.subscribe(`replay:${symbol}`);
  },

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
