const runtimeFeedRegistry = require('./runtimeFeedRegistry');
const runtimeMarketRegistry = require('./runtimeMarketRegistry');
const runtimeEventBus = require('./runtimeEventBus');

class RuntimeStreamCoordinator {
  registerFeed(feed, config = {}) {
    runtimeFeedRegistry.register(feed, config);

    runtimeEventBus.emit('stream.feed.registered', {
      feed,
      ts: Date.now(),
    });
  }

  updateMarket(symbol, payload = {}) {
    runtimeMarketRegistry.register(symbol, payload);

    runtimeEventBus.emit('stream.market.updated', {
      symbol,
      ts: Date.now(),
    });
  }
}

module.exports = new RuntimeStreamCoordinator();
