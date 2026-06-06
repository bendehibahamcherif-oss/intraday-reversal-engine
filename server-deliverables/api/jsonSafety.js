'use strict';

function sanitizeJson(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => {
    const sanitized = sanitizeJson(item);
    return sanitized === undefined ? null : sanitized;
  });
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const sanitized = sanitizeJson(item);
      if (sanitized !== undefined) out[key] = sanitized;
    }
    return out;
  }
  return value;
}

function jsonSafe(res, statusCode, payload) {
  return res.status(statusCode).type('application/json').json(sanitizeJson(payload));
}

module.exports = { sanitizeJson, jsonSafe };
