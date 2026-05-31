'use strict';

/**
 * Evaluation service — computes ML signal quality metrics.
 *
 * PSI thresholds:
 *   < 0.10  : stable (ok)
 *   0.10–0.20: warning (drift_warning)
 *   > 0.20  : critical (drift_critical)
 */

const { LABEL_SPEC } = require('./featureDefinitions');

const PSI_WARNING  = 0.10;
const PSI_CRITICAL = 0.20;

// Rolling window of recent signal predictions for drift tracking
const MAX_HISTORY = 1000;
const _signalHistory = []; // { asOf, class, confidence, provisional }
const _featureHistory = {}; // featureName → number[]  (recent values for PSI)
const _baselineDistribution = {}; // featureName → { mean, std, buckets }

/**
 * Record a new signal prediction for metric tracking.
 */
function recordPrediction(signalResult, featureSnapshot) {
  _signalHistory.push({
    asOf:        signalResult.asOf,
    class:       signalResult.class,
    confidence:  signalResult.confidence,
    provisional: signalResult.provisional,
    recordedAt:  new Date().toISOString(),
  });
  if (_signalHistory.length > MAX_HISTORY) _signalHistory.shift();

  // Track feature values for drift
  if (featureSnapshot?.features) {
    for (const [name, val] of Object.entries(featureSnapshot.features)) {
      if (val == null || !Number.isFinite(val)) continue;
      if (!_featureHistory[name]) _featureHistory[name] = [];
      _featureHistory[name].push(val);
      if (_featureHistory[name].length > MAX_HISTORY) _featureHistory[name].shift();
    }
  }
}

/**
 * Set baseline distribution from training data (call after training completes).
 */
function setBaseline(featureStats) {
  Object.assign(_baselineDistribution, featureStats);
}

/**
 * Compute PSI for a single feature.
 * Compares recent observed distribution vs baseline.
 *
 * @param {number[]} observed  recent feature values
 * @param {number[]} baseline  training feature values (or bucket proportions)
 * @param {number}   nBuckets  default 10
 */
function computePSI(observed, baseline, nBuckets = 10) {
  if (!observed?.length || !baseline?.length) return null;

  const min = Math.min(...baseline);
  const max = Math.max(...baseline);
  if (min === max) return 0;

  const step = (max - min) / nBuckets;
  const buckets = Array.from({ length: nBuckets }, (_, i) => ({ min: min + i * step, max: min + (i + 1) * step }));

  function proportion(values) {
    const counts = buckets.map((b) => values.filter((v) => v >= b.min && v < b.max).length);
    return counts.map((c) => Math.max(c / values.length, 1e-6)); // smooth zeros
  }

  const expPct = proportion(baseline);
  const actPct = proportion(observed);

  let psi = 0;
  for (let i = 0; i < nBuckets; i++) {
    psi += (actPct[i] - expPct[i]) * Math.log(actPct[i] / expPct[i]);
  }
  return Number(psi.toFixed(4));
}

/**
 * Compute drift report for all tracked features.
 */
function computeDriftReport() {
  const report = {};
  let anyDrift = false;

  for (const [name, values] of Object.entries(_featureHistory)) {
    const baseline = _baselineDistribution[name];
    if (!baseline || !values.length) continue;

    const psi = computePSI(values, baseline);
    const status = psi == null ? 'unknown'
      : psi < PSI_WARNING   ? 'ok'
      : psi < PSI_CRITICAL  ? 'drift_warning'
      : 'drift_critical';

    if (status !== 'ok') anyDrift = true;
    report[name] = { psi, status, observedN: values.length };
  }

  return {
    featureDrift:  report,
    globalStatus:  anyDrift ? 'drifting' : 'ok',
    computedAt:    new Date().toISOString(),
  };
}

/**
 * Compute signal quality metrics from recent canonical (non-provisional) predictions.
 */
function computeSignalMetrics() {
  const canonical = _signalHistory.filter((s) => !s.provisional);
  if (!canonical.length) return { ok: false, reason: 'No canonical predictions yet' };

  const dist = { SHORT: 0, NEUTRAL: 0, LONG: 0 };
  let totalConf = 0;
  const confs   = [];

  for (const s of canonical) {
    dist[s.class] = (dist[s.class] || 0) + 1;
    totalConf    += s.confidence;
    confs.push(s.confidence);
  }

  const n = canonical.length;
  confs.sort((a, b) => a - b);

  // Flip rate: consecutive same-class changes / total
  let flips = 0;
  for (let i = 1; i < canonical.length; i++) {
    if (canonical[i].class !== canonical[i - 1].class) flips++;
  }

  return {
    ok:               true,
    evalCount:        n,
    predictionCount:  n,
    classDist:        dist,
    classDistPct: {
      SHORT:   n > 0 ? (dist.SHORT / n * 100).toFixed(1) : '0.0',
      NEUTRAL: n > 0 ? (dist.NEUTRAL / n * 100).toFixed(1) : '0.0',
      LONG:    n > 0 ? (dist.LONG / n * 100).toFixed(1) : '0.0',
    },
    confidenceMean:   n > 0 ? (totalConf / n).toFixed(4) : null,
    confidenceP95:    n > 0 ? confs[Math.floor(n * 0.95)].toFixed(4) : null,
    flipRate:         n > 1 ? (flips / (n - 1)).toFixed(4) : '0.0000',
    missingCount:     0,
    staleCount:       0,
    computedAt:       new Date().toISOString(),
  };
}

/**
 * Compare champion vs challenger on shared recent predictions.
 */
function compareChampionChallenger(championHistory, challengerHistory) {
  if (!championHistory?.length || !challengerHistory?.length) {
    return { disagreementRate: null, reason: 'Insufficient history for both models' };
  }
  // Align by asOf
  const champMap = new Map(championHistory.map((r) => [r.asOf, r.class]));
  let agree = 0, disagree = 0;
  for (const cr of challengerHistory) {
    const champClass = champMap.get(cr.asOf);
    if (!champClass) continue;
    if (champClass === cr.class) agree++; else disagree++;
  }
  const total = agree + disagree;
  return {
    disagreementRate: total > 0 ? (disagree / total).toFixed(4) : null,
    agree, disagree, total,
    computedAt: new Date().toISOString(),
  };
}

function getSignalHistory(limit = 100) {
  return _signalHistory.slice(-limit).reverse();
}

module.exports = {
  recordPrediction, setBaseline, computePSI, computeDriftReport,
  computeSignalMetrics, compareChampionChallenger, getSignalHistory,
  PSI_WARNING, PSI_CRITICAL,
};
