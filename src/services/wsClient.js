class ResilientWebSocket {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.listeners = [];
    this.connected = false;
    this.reconnectAttempts = 0;
    this.heartbeatInterval = null;
    this.subscriptions = new Set();

    this.connect();
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;

      this.startHeartbeat();
      this.resubscribe();

      console.log('WS connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        this.listeners.forEach((cb) => cb(data));
      } catch (err) {
        console.error(err);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;

      this.stopHeartbeat();

      setTimeout(() => {
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
}

const wsClient = new ResilientWebSocket(
  import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws'
);

export default wsClient;
