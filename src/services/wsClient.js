class ResilientWebSocket {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.listeners = [];
    this.connected = false;
    this.reconnectAttempts = 0;
    this.reconnectCount = 0;
    this.heartbeatInterval = null;
    this.subscriptions = new Set();
    this._connectCallbacks = [];
    this._disconnectCallbacks = [];

    this.connect();
  }

  connect() {
    if (typeof WebSocket === 'undefined') {
      this.connected = false;
      return;
    }
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.resubscribe();
      console.log('[wsClient] connected', { reconnectCount: this.reconnectCount });
      this._connectCallbacks.forEach((cb) => { try { cb(this.reconnectCount); } catch (e) { /* ignore */ } });
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.listeners.forEach((cb) => cb(data));
      } catch (err) {
        console.error('[wsClient] parse error', err);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.reconnectCount += 1;
      this.stopHeartbeat();
      console.log('[wsClient] disconnected, scheduling reconnect', { reconnectCount: this.reconnectCount, attempt: this.reconnectAttempts });
      this._disconnectCallbacks.forEach((cb) => { try { cb(this.reconnectCount); } catch (e) { /* ignore */ } });
      setTimeout(() => {
        if (typeof WebSocket === 'undefined') return;
        this.reconnectAttempts += 1;
        this.connect();
      }, Math.min(5000, 1000 * this.reconnectAttempts));
    };
  }

  startHeartbeat() {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      if (this.connected) {
        this.send({ type: 'ping', ts: Date.now() });
      }
    }, 5000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  send(payload) {
    if (this.connected) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  subscribe(channel) {
    this.subscriptions.add(channel);

    this.send({
      type: 'subscribe',
      channel,
    });
  }

  unsubscribe(channel) {
    this.subscriptions.delete(channel);

    this.send({
      type: 'unsubscribe',
      channel,
    });
  }

  resubscribe() {
    this.subscriptions.forEach((channel) => {
      this.send({
        type: 'subscribe',
        channel,
      });
    });
  }

  onMessage(cb) {
    this.listeners.push(cb);
  }

  onConnect(cb) {
    this._connectCallbacks.push(cb);
  }

  onDisconnect(cb) {
    this._disconnectCallbacks.push(cb);
  }
}

function resolveWsUrl() {
  // 1. Explicit override always wins.
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;

  // 2. Derive from VITE_API_BASE: replace http(s): with ws(s):
  const apiBase = import.meta.env.VITE_API_BASE;
  if (apiBase) {
    return apiBase.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:').replace(/\/?$/, '') + '/ws';
  }

  // 3. Derive from current page origin (same host as frontend).
  //    Guarantees wss: on HTTPS pages — fixes mixed-content block in production.
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }

  return 'ws://localhost:3001/ws';
}

const wsClient = new ResilientWebSocket(resolveWsUrl());

export default wsClient;
