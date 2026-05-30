'use strict';

const logger  = require('../observability/logger');
const metrics = require('../observability/metrics');

/**
 * Circuit breaker + provider failover.
 *
 * States per provider:
 *   CLOSED     — normal operation, requests pass through
 *   OPEN       — provider tripped; requests fail fast; probe after cooldown
 *   HALF_OPEN  — one probe request allowed; success → CLOSED, failure → OPEN
 *
 * Thresholds (configurable):
 *   failureThreshold  — errors in rolling window before tripping (default: 5)
 *   windowMs          — rolling window for failure counting (default: 60 000ms)
 *   cooldownMs        — OPEN → HALF_OPEN cooldown (default: 30 000ms)
 *
 * Failover chain: if primary fails fast, calls next provider in the chain.
 */

const STATE = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

class CircuitBreaker {
  constructor(name, { failureThreshold = 5, windowMs = 60_000, cooldownMs = 30_000 } = {}) {
    this.name             = name;
    this.failureThreshold = failureThreshold;
    this.windowMs         = windowMs;
    this.cooldownMs       = cooldownMs;
    this._state           = STATE.CLOSED;
    this._failures        = [];   // timestamps of recent failures
    this._openAt          = null; // when OPEN state started
    this._probeInFlight   = false;

    metrics.setGauge('provider_health', 1, { provider: name });
  }

  get state() { return this._state; }
  get isOpen() { return this._state === STATE.OPEN; }

  _pruneFailures() {
    const cutoff = Date.now() - this.windowMs;
    this._failures = this._failures.filter(ts => ts > cutoff);
  }

  // Wrap an async provider call with circuit breaker logic
  async execute(fn) {
    this._pruneFailures();

    if (this._state === STATE.OPEN) {
      const elapsed = Date.now() - this._openAt;
      if (elapsed < this.cooldownMs) {
        throw Object.assign(new Error(`Circuit breaker OPEN for ${this.name}`), { circuitOpen: true });
      }
      // Transition to HALF_OPEN and allow one probe
      if (!this._probeInFlight) {
        this._state = STATE.HALF_OPEN;
        this._probeInFlight = true;
        logger.info('circuit_breaker_half_open', { provider: this.name });
      } else {
        throw Object.assign(new Error(`Circuit breaker HALF_OPEN probe already in flight for ${this.name}`), { circuitOpen: true });
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      if (!err.circuitOpen) this._onFailure(err);
      throw err;
    }
  }

  _onSuccess() {
    this._probeInFlight = false;
    if (this._state !== STATE.CLOSED) {
      logger.info('circuit_breaker_closed', { provider: this.name });
      metrics.setGauge('provider_health', 1, { provider: this.name });
    }
    this._state    = STATE.CLOSED;
    this._failures = [];
  }

  _onFailure(err) {
    this._probeInFlight = false;
    this._failures.push(Date.now());
    this._pruneFailures();

    if (this._failures.length >= this.failureThreshold || this._state === STATE.HALF_OPEN) {
      this._state  = STATE.OPEN;
      this._openAt = Date.now();
      metrics.setGauge('provider_health', 0, { provider: this.name });
      logger.warn('circuit_breaker_opened', {
        provider: this.name,
        failures: this._failures.length,
        error:    err.message,
      });
    }
  }

  getStatus() {
    this._pruneFailures();
    return {
      provider:         this.name,
      state:            this._state,
      failuresInWindow: this._failures.length,
      openAt:           this._openAt ? new Date(this._openAt).toISOString() : null,
    };
  }

  // Force-trip for manual failover drills
  drill_forceOpen() {
    this._state  = STATE.OPEN;
    this._openAt = Date.now();
    metrics.setGauge('provider_health', 0, { provider: this.name });
    logger.warn('circuit_breaker_drill_forced_open', { provider: this.name });
  }

  drill_forceClose() {
    this._state    = STATE.CLOSED;
    this._failures = [];
    this._openAt   = null;
    metrics.setGauge('provider_health', 1, { provider: this.name });
    logger.info('circuit_breaker_drill_forced_closed', { provider: this.name });
  }
}

// ── Provider failover chain ───────────────────────────────────────────────────

class ProviderChain {
  constructor(providers) {
    // providers: [{ name, fn }]  — fn returns data or throws
    this._breakers = providers.map(({ name }) => [name, new CircuitBreaker(name)]);
    this._fns      = new Map(providers.map(({ name, fn }) => [name, fn]));
  }

  async execute(args) {
    const errors = [];
    for (const [name, breaker] of this._breakers) {
      if (breaker.isOpen) {
        errors.push(`${name}: OPEN`);
        continue;
      }
      try {
        const result = await breaker.execute(() => this._fns.get(name)(args));
        logger.debug('provider_success', { provider: name });
        return { result, provider: name };
      } catch (err) {
        errors.push(`${name}: ${err.message}`);
        logger.warn('provider_failed_trying_next', { provider: name, error: err.message });
      }
    }
    throw new Error(`All providers failed: ${errors.join('; ')}`);
  }

  getStatus() {
    return this._breakers.map(([, b]) => b.getStatus());
  }

  getBreaker(name) {
    return this._breakers.find(([n]) => n === name)?.[1];
  }
}

// ── Failover drill runner ────────────────────────────────────────────────────

async function runFailoverDrill(chain, primaryName) {
  const results = [];
  const primary = chain.getBreaker(primaryName);

  if (!primary) return { error: `Provider '${primaryName}' not found` };

  logger.info('failover_drill_start', { provider: primaryName });
  results.push({ step: 'initial_state', status: chain.getStatus() });

  // Step 1: Force-open primary
  primary.drill_forceOpen();
  results.push({ step: 'primary_tripped', status: chain.getStatus() });

  // Step 2: Execute — should failover to secondary
  try {
    const { provider } = await chain.execute({});
    results.push({ step: 'failover_executed', usedProvider: provider, success: true });
  } catch (err) {
    results.push({ step: 'failover_executed', success: false, error: err.message });
  }

  // Step 3: Restore primary
  primary.drill_forceClose();
  results.push({ step: 'primary_restored', status: chain.getStatus() });

  logger.info('failover_drill_complete', { provider: primaryName, steps: results.length });
  return { drill: primaryName, steps: results, completedAt: new Date().toISOString() };
}

module.exports = { CircuitBreaker, ProviderChain, runFailoverDrill, STATE };
