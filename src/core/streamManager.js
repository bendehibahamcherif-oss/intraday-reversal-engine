import { io } from 'socket.io-client';
import { eventBus, EVENTS } from './eventBus';
import { api, getToken } from '../api.js';

class StreamManager {
  constructor() {
    this.socket = null;
    this.connected = false;
  }

  connect(symbols = []) {
    if (this.socket) return this.socket;

    this.socket = io(api.base, {
      transports: ['websocket', 'polling'],
      auth: {
        token: getToken() || import.meta.env.VITE_USER_TOKEN || '',
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
    });

    this.socket.on('connect', () => {
      this.connected = true;

      if (symbols.length) {
        this.socket.emit('subscribe', { symbols });
      }
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
    });

    this.socket.on('price_update', (payload) => {
      eventBus.emit(EVENTS.PRICE_UPDATE, payload);
    });

    this.socket.on('signal_update', (payload) => {
      eventBus.emit(EVENTS.SIGNAL_UPDATE, payload);
    });

    return this.socket;
  }
}

export const streamManager = new StreamManager();
