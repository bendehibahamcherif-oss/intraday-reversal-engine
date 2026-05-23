const clientManager = require('./clientManager');

class BroadcastEngine {
  broadcastMarketTick(symbol, tick) {
    clientManager.broadcast(
      `market:${symbol}`,
      {
        type: 'tick',
        symbol,
        payload: tick,
        ts: Date.now(),
      }
    );
  }

  broadcastOrderBook(symbol, book) {
    clientManager.broadcast(
      `market:${symbol}`,
      {
        type: 'orderbook',
        symbol,
        payload: book,
        ts: Date.now(),
      }
    );
  }

  broadcastReplay(channel, payload) {
    clientManager.broadcast(channel, {
      type: 'replay',
      payload,
      ts: Date.now(),
    });
  }

  broadcastSystem(event, payload = {}) {
    clientManager.broadcast('system', {
      type: 'system',
      event,
      payload,
      ts: Date.now(),
    });
  }

  broadcastExecution(execution) {
    clientManager.broadcast('executions', {
      type: 'execution',
      payload: execution,
      ts: Date.now(),
    });
  }
}

module.exports = new BroadcastEngine();
