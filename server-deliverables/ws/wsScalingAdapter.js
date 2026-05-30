'use strict';

const metrics = require('../observability/metrics');
const logger  = require('../observability/logger');

/**
 * WebSocket broadcast adapter.
 *
 * Abstracts the broadcast operation behind a simple interface so the
 * in-memory strategy can be swapped for a Redis pub/sub adapter with
 * zero changes to call sites.
 *
 * Current backend:  InMemoryAdapter  (single process, direct ws.send())
 * Scaling path:     RedisAdapter     (multi-process, Redis pub/sub)
 *
 * Scaling upgrade path:
 *   1. Deploy Redis (Upstash, Render Redis, etc.)
 *   2. Set REDIS_URL env var
 *   3. Replace `new InMemoryAdapter()` with `new RedisAdapter(REDIS_URL)` below
 *   4. No other code changes required
 */

// ── In-memory adapter (current, single-process) ───────────────────────────────

class InMemoryAdapter {
  constructor() {
    this._clients = new Map(); // connectionId → ws
    this._channels = new Map(); // channel → Set<connectionId>
    logger.info('ws_adapter_init', { adapter: 'in-memory' });
  }

  register(connectionId, ws) {
    this._clients.set(connectionId, ws);
    metrics.incGauge('ws_connections_active', 1);
    logger.debug('ws_client_registered', { connectionId, total: this._clients.size });
  }

  unregister(connectionId) {
    this._clients.delete(connectionId);
    for (const subs of this._channels.values()) subs.delete(connectionId);
    metrics.incGauge('ws_connections_active', -1);
    logger.debug('ws_client_unregistered', { connectionId, total: this._clients.size });
  }

  subscribe(connectionId, channel) {
    if (!this._channels.has(channel)) this._channels.set(channel, new Set());
    this._channels.get(channel).add(connectionId);
    logger.debug('ws_subscribe', { connectionId, channel });
  }

  unsubscribe(connectionId, channel) {
    this._channels.get(channel)?.delete(connectionId);
  }

  // Broadcast to all subscribers of a channel
  publish(channel, payload) {
    const subs = this._channels.get(channel);
    if (!subs?.size) return 0;
    const msg = JSON.stringify(payload);
    let sent = 0;
    for (const cid of subs) {
      const ws = this._clients.get(cid);
      if (ws?.readyState === 1 /* OPEN */) {
        try { ws.send(msg); sent++; } catch { this.unregister(cid); }
      }
    }
    metrics.incCounter('ws_messages_total', { channel }, sent);
    return sent;
  }

  // Broadcast to all connected clients regardless of subscription
  broadcast(payload) {
    const msg = JSON.stringify(payload);
    let sent = 0;
    for (const [cid, ws] of this._clients) {
      if (ws?.readyState === 1) {
        try { ws.send(msg); sent++; } catch { this.unregister(cid); }
      }
    }
    metrics.incCounter('ws_messages_total', { channel: '__all__' }, sent);
    return sent;
  }

  getStats() {
    return {
      adapter: 'in-memory',
      connections: this._clients.size,
      channels: Object.fromEntries([...this._channels.entries()].map(([c, s]) => [c, s.size])),
    };
  }
}

// ── Redis adapter interface (upgrade path documentation) ─────────────────────
// To implement, install `ioredis` and implement this class:
//
// class RedisAdapter {
//   constructor(redisUrl) {
//     const Redis = require('ioredis');
//     this._pub = new Redis(redisUrl);
//     this._sub = new Redis(redisUrl);
//     this._local = new InMemoryAdapter();  // local connection registry
//     this._sub.on('message', (channel, msg) => {
//       // Forward Redis messages to local WS clients subscribed to this channel
//       const payload = JSON.parse(msg);
//       this._local.publish(channel, payload);
//     });
//   }
//   register(cid, ws)       { this._local.register(cid, ws); }
//   unregister(cid)         { this._local.unregister(cid); }
//   subscribe(cid, channel) { this._local.subscribe(cid, channel); this._sub.subscribe(channel); }
//   unsubscribe(cid, ch)    { this._local.unsubscribe(cid, ch); }
//   publish(channel, payload) {
//     return this._pub.publish(channel, JSON.stringify(payload));
//   }
//   broadcast(payload)      { return this._pub.publish('__broadcast__', JSON.stringify(payload)); }
//   getStats()              { return { adapter: 'redis', ...this._local.getStats() }; }
// }

// ── Factory ───────────────────────────────────────────────────────────────────

function createAdapter() {
  if (process.env.REDIS_URL) {
    logger.warn('ws_redis_adapter_not_installed', {
      hint: 'Set REDIS_URL and install ioredis to enable Redis pub/sub adapter',
    });
  }
  return new InMemoryAdapter();
}

// Singleton adapter — import this throughout the backend
const wsAdapter = createAdapter();

module.exports = { wsAdapter, InMemoryAdapter };
