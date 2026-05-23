import { io } from 'socket.io-client';
import { eventBus, EVENTS } from './eventBus';
import { api, getToken } from '../api.js';

class StreamManager {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.watchdog = null;
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
      reconnectionDelay: 1000,
      timeout: 10000,
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

    this.socket.on('connect_error', (err) => {
      console.error('SOCKET_ERROR', err?.message);
    });

    this.socket.on('price_update', (payload) => {
      eventBus.emit(EVENTS.PRICE_UPDATE, payload);
    });

    this.socket.on('signal_update', (payload) => {
      eventBus.emit(EVENTS.SIGNAL_UPDATE, payload);
    });

    this.startWatchdog();

    return this.socket;
  }

  startWatchdog() {
    if (this.watchdog) {
      clearInterval(this.watchdog);
    }

    this.watchdog = setInterval(() => {
      if (!this.socket) return;

      if (!this.connected) {
        console.warn('WATCHDOG_RECONNECT');

        try {
          this.socket.connect();
        } catch (err) {
          console.error(err);
        }
      }
    }, 5000);
  }
}

export const streamManager = new StreamManager();
