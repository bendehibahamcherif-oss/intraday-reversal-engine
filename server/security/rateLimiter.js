class RateLimiter {
  constructor(limit = 100, windowMs = 60000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  check(key) {
    const now = Date.now();

    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }

    const timestamps = this.requests
      .get(key)
      .filter((ts) => now - ts < this.windowMs);

    timestamps.push(now);

    this.requests.set(key, timestamps);

    return timestamps.length <= this.limit;
  }

  middleware() {
    return (req, res, next) => {
      const key = req.ip || 'unknown';

      if (!this.check(key)) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
        });
      }

      next();
    };
  }
}

module.exports = new RateLimiter();
