'use strict';

const metrics = require('../observability/metrics');
const logger  = require('../observability/logger');

/**
 * Sliding-window rate limiter.
 *
 * Interface is Redis-ready: replace `SlidingWindowStore` with a Redis
 * ZADD/ZREMRANGEBYSCORE/ZCARD adapter for multi-instance deployments.
 *
 * Tiers:
 *   api   — 200 req/min per IP (general API)
 *   auth  — 20 req/min per IP (login/register)
 *   ws    — 500 msg/min per connection
 *   heavy — 30 req/min per IP (compute-heavy: /ml, /multi-asset, /institutional)
 */

class SlidingWindowStore {
  constructor() {
    // Map<key, number[]> — timestamps of requests within current window
    this._windows = new Map();
    // Cleanup stale entries every 5 minutes
    this._timer = setInterval(() => this._gc(), 5 * 60 * 1000).unref();
  }

  // Returns count of requests in [now - windowMs, now] after recording this one
  record(key, windowMs) {
    const now = Date.now();
    const arr = this._windows.get(key) || [];
    const cutoff = now - windowMs;
    // Purge expired entries, append current
    const fresh = arr.filter(ts => ts > cutoff);
    fresh.push(now);
    this._windows.set(key, fresh);
    return fresh.length;
  }

  _gc() {
    const now = Date.now();
    for (const [k, arr] of this._windows) {
      if (!arr.length || arr[arr.length - 1] < now - 5 * 60 * 1000) {
        this._windows.delete(k);
      }
    }
  }
}

const store = new SlidingWindowStore();

const TIERS = {
  api:   { windowMs: 60_000, max: 200 },
  auth:  { windowMs: 60_000, max: 20  },
  ws:    { windowMs: 60_000, max: 500 },
  heavy: { windowMs: 60_000, max: 30  },
};

function getClientKey(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';
}

/**
 * Returns Express middleware for the given tier.
 * Usage: app.use('/api', rateLimiter('api'))
 *        app.use('/auth', rateLimiter('auth'))
 *        app.use('/api/ml', rateLimiter('heavy'))
 */
function rateLimiter(tier = 'api') {
  const { windowMs, max } = TIERS[tier] || TIERS.api;

  return function rateLimitMiddleware(req, res, next) {
    const clientKey = `${tier}:${getClientKey(req)}`;
    const count     = store.record(clientKey, windowMs);

    res.setHeader('X-RateLimit-Limit',     String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - count)));
    res.setHeader('X-RateLimit-Reset',     String(Math.ceil((Date.now() + windowMs) / 1000)));

    if (count > max) {
      metrics.incCounter('rate_limit_rejections_total', { tier });
      logger.warn('rate_limit_exceeded', {
        correlationId: req.correlationId,
        tier, clientKey, count, max,
      });
      return res.status(429).json({
        error: 'Too Many Requests',
        retryAfter: Math.ceil(windowMs / 1000),
      });
    }

    next();
  };
}

// WebSocket rate limiter (call from ws message handler)
function wsRateCheck(connectionId) {
  const count = store.record(`ws:${connectionId}`, TIERS.ws.windowMs);
  if (count > TIERS.ws.max) {
    metrics.incCounter('rate_limit_rejections_total', { tier: 'ws' });
    return false;
  }
  return true;
}

module.exports = { rateLimiter, wsRateCheck, TIERS, SlidingWindowStore };
