class EventBus {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }

    this.listeners[event].push(callback);

    return () => {
      this.listeners[event] = this.listeners[event].filter(
        (cb) => cb !== callback
      );
    };
  }

  emit(event, payload) {
    if (!this.listeners[event]) return;

    this.listeners[event].forEach((cb) => cb(payload));
  }
}

export const EVENTS = {
  PRICE_UPDATE: 'PRICE_UPDATE',
  SIGNAL_UPDATE: 'SIGNAL_UPDATE',
  REGIME_CHANGE: 'REGIME_CHANGE',
};

export const eventBus = new EventBus();
