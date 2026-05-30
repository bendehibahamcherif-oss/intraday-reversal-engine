'use strict';

/**
 * Centralized runtime configuration.
 *
 * All configurable values in one place — no hardcoded constants scattered
 * across the codebase. Override any value via environment variables.
 */

function parseInt10(val, fallback) {
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseBool(val, fallback) {
  if (val === 'true')  return true;
  if (val === 'false') return false;
  return fallback;
}

function parseOrigins(val) {
  if (!val) return ['http://localhost:5173', 'http://localhost:3000'];
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

const config = {
  // ── Server ────────────────────────────────────────────────────────────────
  port:        parseInt10(process.env.PORT, 10000),
  host:        process.env.HOST || '0.0.0.0',
  nodeEnv:     process.env.NODE_ENV || 'development',
  serviceName: process.env.SERVICE_NAME || 'reversal-backend',

  // ── Persistence ───────────────────────────────────────────────────────────
  mongoUri:    process.env.MONGO_URI || '',
  mongoDb:     process.env.MONGO_DB  || 'reversal',

  // ── WebSocket ─────────────────────────────────────────────────────────────
  wsPath:        process.env.WS_PATH  || '/ws',
  wsPingInterval: parseInt10(process.env.WS_PING_INTERVAL_MS, 5000),
  redisUrl:      process.env.REDIS_URL || '',  // empty = in-memory WS adapter

  // ── CORS ─────────────────────────────────────────────────────────────────
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),

  // ── Observability ─────────────────────────────────────────────────────────
  logLevel:   process.env.LOG_LEVEL   || 'info',
  logPretty:  parseBool(process.env.LOG_PRETTY, process.env.NODE_ENV !== 'production'),
  metricsPath: process.env.METRICS_PATH || '/metrics',

  // ── Auth ─────────────────────────────────────────────────────────────────
  jwtSecret:       process.env.JWT_SECRET || 'change-me-in-production',
  jwtExpirySeconds: parseInt10(process.env.JWT_EXPIRY_S, 86400),  // 24 h

  // ── Rate limiting ─────────────────────────────────────────────────────────
  rateLimit: {
    api:   { windowMs: parseInt10(process.env.RL_API_WINDOW_MS,   60_000), max: parseInt10(process.env.RL_API_MAX,   200) },
    auth:  { windowMs: parseInt10(process.env.RL_AUTH_WINDOW_MS,  60_000), max: parseInt10(process.env.RL_AUTH_MAX,   20) },
    ws:    { windowMs: parseInt10(process.env.RL_WS_WINDOW_MS,    60_000), max: parseInt10(process.env.RL_WS_MAX,    500) },
    heavy: { windowMs: parseInt10(process.env.RL_HEAVY_WINDOW_MS, 60_000), max: parseInt10(process.env.RL_HEAVY_MAX,  30) },
  },

  // ── Market session guardrails ─────────────────────────────────────────────
  marketGuardrails: {
    blockLiveOutsideHours: parseBool(process.env.BLOCK_LIVE_OUTSIDE_HOURS, true),
    timezone:              'America/New_York',
    openHour:              9, openMinute:  30,
    closeHour:             16, closeMinute: 0,
  },

  // ── Tenancy (single-user model default) ───────────────────────────────────
  tenancy: {
    enabled:       parseBool(process.env.MULTI_TENANT, false),  // false = single-tenant
    defaultTenant: 'default',
  },
};

// Startup validation
if (config.jwtSecret === 'change-me-in-production' && config.nodeEnv === 'production') {
  process.stderr.write('FATAL: JWT_SECRET must be set in production\n');
  process.exit(1);
}

module.exports = config;
