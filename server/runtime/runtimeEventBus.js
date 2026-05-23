class RuntimeEventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    this.listeners.get(event).push(handler);
  }

  emit(event, payload) {
    const handlers = this.listeners.get(event) || [];

    handlers.forEach((handler) => {
      try {
        handler(payload);
      } catch (err) {
        console.error(err);
      }
    });
  }
}

module.exports = new RuntimeEventBus();
