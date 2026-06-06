import '@testing-library/jest-dom';

if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    constructor(url) {
      this.url = url;
      this.readyState = MockWebSocket.OPEN;
      setTimeout(() => this.onopen?.({ type: 'open' }), 0);
    }
    send() {}
    close() {
      this.readyState = MockWebSocket.CLOSED;
      this.onclose?.({ type: 'close' });
    }
  };
}
