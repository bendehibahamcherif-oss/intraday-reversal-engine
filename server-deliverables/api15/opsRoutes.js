'use strict';

const { Router }   = require('express');
const metrics      = require('../observability/metrics');
const { getSessionState } = require('../guardrails/marketSessionGuardrails');
const { wsAdapter }       = require('../ws/wsScalingAdapter');
const config              = require('../config/runtimeConfig');

const router = Router();

/**
 * Ops / observability routes.
 *
 * GET /api/ops/status  — JSON health snapshot (latency, errors, WS, session, providers)
 * GET /metrics         — Prometheus text format (mount at app level, not under /api)
 */

// GET /api/ops/status
router.get('/status', (req, res) => {
  try {
    const snap    = metrics.getSnapshot();
    const session = getSessionState();
    const ws      = wsAdapter.getStats();

    res.json({
      ok:          true,
      service:     config.serviceName,
      nodeEnv:     config.nodeEnv,
      uptime:      Math.floor(process.uptime()),
      memMb:       Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      session,
      ws,
      metrics:     snap,
      rateLimits:  config.rateLimit,
      tenancy:     config.tenancy,
      timestamp:   new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ops/drill/:provider  — run failover drill (POST is safer but GET is easier to smoke-test)
router.post('/drill/:provider', async (req, res) => {
  // This endpoint is intentionally not auto-applied — requires explicit call
  // Import lazily to avoid circular deps during startup
  try {
    const { ProviderChain, runFailoverDrill } = require('../failover/providerFailover');
    // The caller must pass their chain; this is a utility endpoint scaffold
    res.json({ message: `Failover drill for '${req.params.provider}' must be wired to a specific ProviderChain instance.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
