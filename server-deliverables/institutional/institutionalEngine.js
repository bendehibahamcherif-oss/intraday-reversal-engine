'use strict';

// ── Pre-defined scenario packs ────────────────────────────────────────────────
const SCENARIO_PACKS = {
  crisis_2008: {
    id: 'crisis_2008', name: '2008 Financial Crisis',
    description: 'Global financial crisis — Lehman collapse, credit freeze',
    shocks: { equity: -0.50, bonds: 0.10, commodities: -0.30 },
  },
  covid_2020: {
    id: 'covid_2020', name: '2020 COVID Crash',
    description: 'Pandemic shock — fastest 30% drawdown in history',
    shocks: { equity: -0.35, bonds: 0.08, commodities: -0.45 },
  },
  rate_shock_2022: {
    id: 'rate_shock_2022', name: '2022 Rate Shock',
    description: 'Fed hiking cycle — bonds −20%, equities −25%',
    shocks: { equity: -0.25, bonds: -0.20, commodities: 0.10 },
  },
  flash_crash: {
    id: 'flash_crash', name: 'Flash Crash',
    description: 'Intraday circuit-breaker event — rapid −10%',
    shocks: { equity: -0.10, bonds: 0.05, commodities: -0.05 },
  },
  tech_correction: {
    id: 'tech_correction', name: 'Tech Sector Correction',
    description: 'Growth/tech rotation — growth names −30%',
    shocks: { equity: -0.15, bonds: 0.05, commodities: 0.02 },
  },
};

// ── Sizing formulas ───────────────────────────────────────────────────────────

/**
 * Volatility-target sizing.
 * shares = floor( (equity × riskPct) / (price × dailyVol × √horizon) )
 * where dailyVol = annualizedVol / √252
 *
 * Reproducibility: all intermediate values returned for audit.
 */
function computeVolSizing({ accountEquity, riskPct, annualizedVol, price, horizon = 1 }) {
  const eq  = Number(accountEquity);
  const rp  = Number(riskPct) / 100;
  const vol = Number(annualizedVol) / 100;
  const px  = Number(price);
  const h   = Math.max(1, Number(horizon));

  if (!eq || !rp || !vol || !px) throw new Error('Invalid sizing inputs');

  const targetRisk     = eq * rp;
  const dailyVol       = vol / Math.sqrt(252);
  const periodVol      = dailyVol * Math.sqrt(h);
  const notional       = targetRisk / periodVol;
  const shares         = Math.max(1, Math.floor(notional / px));
  const actualNotional = shares * px;
  const dollarRisk     = actualNotional * periodVol;

  return {
    method:         'volatility_target',
    targetRisk:     r(targetRisk, 2),
    dailyVol:       r(dailyVol * 100, 4),
    periodVol:      r(periodVol * 100, 4),
    notional:       r(notional, 2),
    shares,
    actualNotional: r(actualNotional, 2),
    dollarRisk:     r(dollarRisk, 2),
    inputs: { accountEquity: eq, riskPct: Number(riskPct), annualizedVol: Number(annualizedVol), price: px, horizon: h },
  };
}

/**
 * Capped Kelly sizing.
 * fullKelly = (p × b − q) / b,  b = avgWin / avgLoss
 * cappedKelly = min(fullKelly × kellyFraction, maxAllocation%)
 * shares = floor(equity × cappedKelly / price)
 *
 * mlConfidence (optional, 0–1): overrides winRate when provided.
 */
function computeKellySizing({ accountEquity, price, winRate, avgWinPct, avgLossPct, kellyFraction = 0.5, maxAllocationPct = 25, mlConfidence = null }) {
  const eq   = Number(accountEquity);
  const px   = Number(price);
  const wr   = mlConfidence !== null
    ? Math.max(0.01, Math.min(0.99, Number(mlConfidence)))
    : Math.max(0.01, Math.min(0.99, Number(winRate) / 100));
  const bWin = Math.max(0.001, Number(avgWinPct) / 100);
  const bLos = Math.max(0.001, Number(avgLossPct) / 100);
  const kf   = Math.max(0.01, Math.min(1, Number(kellyFraction)));
  const maxA = Math.max(0.01, Math.min(1, Number(maxAllocationPct) / 100));

  if (!eq || !px) throw new Error('Invalid Kelly inputs');

  const odds        = bWin / bLos;
  const fullKelly   = Math.max(0, (wr * odds - (1 - wr)) / odds);
  const cappedKelly = Math.min(fullKelly * kf, maxA);
  const notional    = eq * cappedKelly;
  const shares      = Math.max(0, Math.floor(notional / px));

  return {
    method:           'capped_kelly',
    fullKelly:        r(fullKelly * 100, 2),
    cappedKelly:      r(cappedKelly * 100, 2),
    odds:             r(odds, 3),
    notional:         r(notional, 2),
    shares,
    actualNotional:   r(shares * px, 2),
    usedMlConfidence: mlConfidence !== null,
    inputs: {
      accountEquity: eq, price: px,
      winRate: r(wr * 100, 2), avgWinPct: Number(avgWinPct), avgLossPct: Number(avgLossPct),
      kellyFraction: kf, maxAllocationPct: Number(maxAllocationPct),
      mlConfidence: mlConfidence !== null ? r(Number(mlConfidence) * 100, 1) : null,
    },
  };
}

/**
 * Apply a scenario shock to a position list.
 * Computes per-position and aggregate P&L impact.
 */
function applyScenario(positions, scenario) {
  if (!Array.isArray(positions) || !positions.length) throw new Error('No positions provided');

  const posResults = positions.map((pos) => {
    const notional   = Number(pos.shares) * Number(pos.price);
    const assetClass = (pos.assetClass || 'equity').toLowerCase();
    const shock      = scenario.shocks[assetClass] ?? scenario.shocks.equity ?? 0;
    return {
      symbol:   pos.symbol,
      shares:   pos.shares,
      price:    pos.price,
      notional: r(notional, 2),
      shock:    r(shock * 100, 2),
      pnl:      r(notional * shock, 2),
    };
  });

  const totalNotional = posResults.reduce((s, p) => s + p.notional, 0);
  const totalPnl      = posResults.reduce((s, p) => s + p.pnl, 0);
  const pctImpact     = totalNotional > 0 ? totalPnl / totalNotional : 0;

  return {
    scenarioId:    scenario.id,
    scenarioName:  scenario.name,
    positions:     posResults,
    totalNotional: r(totalNotional, 2),
    totalPnl:      r(totalPnl, 2),
    pctImpact:     r(pctImpact * 100, 2),
    runAt:         new Date().toISOString(),
  };
}

// ── Audit store (in-memory, TTL-based rolling window) ─────────────────────────
const auditStore = [];
const AUDIT_MAX  = 500;

function recordAudit(entry) {
  auditStore.unshift({ ...entry, recordedAt: new Date().toISOString() });
  if (auditStore.length > AUDIT_MAX) auditStore.length = AUDIT_MAX;
}

function getAudit(limit = 50) {
  return auditStore.slice(0, limit);
}

// ── Export builder ─────────────────────────────────────────────────────────────
function buildExport({ type, inputs, outputs, mode, meta = {} }) {
  return {
    exportVersion: '1.0',
    exportedAt:    new Date().toISOString(),
    type, mode,
    assumptions:   inputs,
    results:       outputs,
    meta:          { ...meta, noHiddenLiveDependence: true },
  };
}

// helpers
function r(n, d) { return Math.round(n * 10 ** d) / 10 ** d; }

module.exports = {
  SCENARIO_PACKS,
  computeVolSizing,
  computeKellySizing,
  applyScenario,
  recordAudit,
  getAudit,
  buildExport,
  _internal: { r },
};
