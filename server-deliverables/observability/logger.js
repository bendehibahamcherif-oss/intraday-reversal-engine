'use strict';

/**
 * Structured JSON logger — no external dependencies.
 * Compatible with log aggregators that expect newline-delimited JSON (NDJSON).
 *
 * Levels: error=0, warn=1, info=2, debug=3
 * Set LOG_LEVEL env var to control verbosity (default: 'info').
 * Set LOG_PRETTY=true for human-readable output in development.
 */

const LEVEL_NUM = { error: 0, warn: 1, info: 2, debug: 3 };
const LEVEL_EMJ = { error: '✗', warn: '⚠', info: '·', debug: '○' };

const threshold  = LEVEL_NUM[process.env.LOG_LEVEL || 'info'] ?? 2;
const pretty     = process.env.LOG_PRETTY === 'true';
const service    = process.env.SERVICE_NAME || 'reversal-backend';

function write(level, message, meta = {}) {
  if ((LEVEL_NUM[level] ?? 99) > threshold) return;

  const entry = {
    ts:            new Date().toISOString(),
    level,
    pid:           process.pid,
    service,
    correlationId: meta.correlationId ?? null,
    traceId:       meta.traceId ?? null,
    tenantId:      meta.tenantId ?? 'default',
    message,
  };

  // Merge extra meta, excluding fields already at top level
  const { correlationId, traceId, tenantId, ...rest } = meta;
  void correlationId; void traceId; void tenantId;
  if (Object.keys(rest).length) entry.meta = rest;

  if (pretty) {
    const prefix = `${entry.ts} ${LEVEL_EMJ[level] || '?'} [${level.toUpperCase().padEnd(5)}] `;
    const suffix = entry.correlationId ? ` (cid=${entry.correlationId})` : '';
    process.stdout.write(`${prefix}${message}${suffix}${entry.meta ? ' ' + JSON.stringify(entry.meta) : ''}\n`);
  } else {
    process.stdout.write(JSON.stringify(entry) + '\n');
  }
}

function child(defaultMeta = {}) {
  return {
    error: (msg, meta) => write('error', msg, { ...defaultMeta, ...meta }),
    warn:  (msg, meta) => write('warn',  msg, { ...defaultMeta, ...meta }),
    info:  (msg, meta) => write('info',  msg, { ...defaultMeta, ...meta }),
    debug: (msg, meta) => write('debug', msg, { ...defaultMeta, ...meta }),
    child: (extra)     => child({ ...defaultMeta, ...extra }),
  };
}

const logger = {
  error: (msg, meta) => write('error', msg, meta),
  warn:  (msg, meta) => write('warn',  msg, meta),
  info:  (msg, meta) => write('info',  msg, meta),
  debug: (msg, meta) => write('debug', msg, meta),
  child,
};

module.exports = logger;
