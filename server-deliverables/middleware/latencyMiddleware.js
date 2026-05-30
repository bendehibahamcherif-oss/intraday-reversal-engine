'use strict';

const metrics = require('../observability/metrics');
const logger  = require('../observability/logger');

/**
 * Per-route latency and error-rate middleware.
 *
 * On every response:
 *   - records http_request_duration_ms histogram keyed by {method, route, status}
 *   - increments http_requests_total counter
 *   - increments http_errors_total for 4xx/5xx
 *   - logs a structured access log line at 'info' level
 *
 * Requires correlationMiddleware to have run first (sets req.startTime).
 */

function latencyMiddleware(req, res, next) {
  res.on('finish', () => {
    const elapsedNs  = process.hrtime.bigint() - (req.startTime || BigInt(0));
    const elapsedMs  = Number(elapsedNs) / 1e6;
    const route      = req.route?.path || req.path || 'unknown';
    const labels     = { method: req.method, route, status: String(res.statusCode) };

    metrics.recordHistogram('http_request_duration_ms', elapsedMs, labels);
    metrics.incCounter('http_requests_total', labels);
    if (res.statusCode >= 400) metrics.incCounter('http_errors_total', labels);

    logger.info('http_access', {
      correlationId: req.correlationId,
      traceId:       req.traceId,
      tenantId:      req.tenantId,
      method:        req.method,
      path:          req.originalUrl,
      status:        res.statusCode,
      latencyMs:     Math.round(elapsedMs),
    });
  });

  next();
}

module.exports = latencyMiddleware;
