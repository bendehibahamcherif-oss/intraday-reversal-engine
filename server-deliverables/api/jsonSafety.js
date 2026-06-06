'use strict';

function sanitizeJson(value, seen = new WeakSet()) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name || 'Error',
      message: value.message || 'Internal error',
      code: value.code,
      status: value.status,
    };
  }
  if (Array.isArray(value)) return value.map((item) => {
    const sanitized = sanitizeJson(item, seen);
    return sanitized === undefined ? null : sanitized;
  });
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const sanitized = sanitizeJson(item, seen);
      if (sanitized !== undefined) out[key] = sanitized;
    }
    seen.delete(value);
    return out;
  }
  return String(value);
}

function jsonSafe(res, statusCode, payload) {
  return res.status(statusCode).type('application/json').json(sanitizeJson(payload));
}

function apiNotFound(req, res) {
  return jsonSafe(res, 404, {
    ok: false,
    status: 'endpoint_not_found',
    message: 'API endpoint not found.',
    endpoint: req.originalUrl || req.url,
    method: req.method,
  });
}

function apiErrorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const statusCode = Number.isInteger(err?.status) && err.status >= 400 ? err.status : 500;
  return jsonSafe(res, statusCode, {
    ok: false,
    status: statusCode === 404 ? 'endpoint_not_found' : 'internal_error',
    message: statusCode === 404 ? 'API endpoint not found.' : (err?.message || 'Internal server error.'),
    requestId: req.id || req.correlationId || req.headers?.['x-request-id'] || null,
  });
}

module.exports = { sanitizeJson, jsonSafe, apiNotFound, apiErrorHandler };
