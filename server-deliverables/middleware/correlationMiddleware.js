'use strict';

const { randomBytes } = require('crypto');

/**
 * Correlation and trace middleware.
 *
 * Injects onto req:
 *   req.correlationId — from X-Correlation-ID header, or a new UUID-like id
 *   req.traceId       — always freshly generated per request
 *   req.tenantId      — from X-Tenant-ID header (defaults to 'default' for single-tenant)
 *   req.startTime     — high-resolution start timestamp (for latency tracking)
 *
 * Echoes X-Correlation-ID and X-Trace-ID back on the response.
 */

function generateId(prefix = '') {
  return prefix + randomBytes(8).toString('hex');
}

function correlationMiddleware(req, res, next) {
  req.correlationId = req.headers['x-correlation-id'] || generateId('cid-');
  req.traceId       = generateId('trc-');
  req.tenantId      = req.headers['x-tenant-id'] || 'default';
  req.startTime     = process.hrtime.bigint();

  res.setHeader('X-Correlation-ID', req.correlationId);
  res.setHeader('X-Trace-ID',       req.traceId);

  next();
}

module.exports = correlationMiddleware;
