class OrderBookEngine {
  constructor() {
    this.books = new Map();
  }

  initializeBook(symbol) {
    if (!this.books.has(symbol)) {
      this.books.set(symbol, {
        bids: [],
        asks: [],
        updatedAt: Date.now(),
      });
    }

    return this.books.get(symbol);
  }

  update(symbol, side, price, size) {
    const book = this.initializeBook(symbol);

    const levels = side === 'bid'
      ? book.bids
      : book.asks;

    const existing = levels.find(
      (l) => l.price === price
    );

    if (existing) {
      existing.size = size;
    } else {
      levels.push({
        price,
        size,
      });
    }

    const filtered = levels
      .filter((l) => l.size > 0)
      .sort((a, b) =>
        side === 'bid'
          ? b.price - a.price
          : a.price - b.price
      )
      .slice(0, 25);

    if (side === 'bid') {
      book.bids = filtered;
    } else {
      book.asks = filtered;
    }

    book.updatedAt = Date.now();

    return book;
  }

  getBook(symbol) {
    return this.books.get(symbol) || {
      bids: [],
      asks: [],
    };
  }

  getImbalance(symbol) {
    const book = this.getBook(symbol);

    const bidLiquidity = book.bids.reduce(
      (acc, level) => acc + level.size,
      0
    );

    const askLiquidity = book.asks.reduce(
      (acc, level) => acc + level.size,
      0
    );

    const total = bidLiquidity + askLiquidity;

    if (total === 0) {
      return 0;
    }

    return (
      (bidLiquidity - askLiquidity) /
      total
    );
  }
}

module.exports = new OrderBookEngine();
