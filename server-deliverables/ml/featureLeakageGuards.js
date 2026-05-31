'use strict';

/**
 * Anti-leakage guards for the P1 feature engine.
 *
 * Every source passed to featureService must clear these checks before
 * any feature calculation proceeds. A guard failure throws a LeakageError
 * which the featureService propagates as a 400-level rejection.
 *
 * Checks:
 *   1. Source timestamps must be <= asOf
 *   2. No field names matching 'future_*' in source objects
 *   3. Candle bar asOf must be a closed-bar timestamp (not a partial bar)
 *   4. Rolling windows must use only index < t (strictly historical)
 *   5. Dataset join guard: merged row must not contain label-row's asOf that
 *      precedes feature-row's asOf (no forward join)
 */

class LeakageError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'LeakageError';
    this.context = context;
  }
}

/**
 * Assert that every source timestamp is <= asOf.
 * @param {Record<string, string|Date>} sourceTimestamps  e.g. { candles: '...', cvd: '...' }
 * @param {Date|string} asOf
 */
function assertSourceTimestamps(sourceTimestamps, asOf) {
  const asOfMs = new Date(asOf).getTime();
  if (!Number.isFinite(asOfMs)) throw new LeakageError('asOf is not a valid date', { asOf });

  for (const [source, ts] of Object.entries(sourceTimestamps)) {
    if (ts == null) continue; // missing source — featureService handles this separately
    const tsMs = new Date(ts).getTime();
    if (!Number.isFinite(tsMs)) {
      throw new LeakageError(`Source timestamp for ${source} is not a valid date`, { source, ts, asOf });
    }
    if (tsMs > asOfMs + 1000) { // 1-second tolerance for rounding
      throw new LeakageError(
        `LEAKAGE: source '${source}' timestamp ${ts} is AFTER asOf ${asOf}`,
        { source, sourceTs: ts, asOf, diffMs: tsMs - asOfMs }
      );
    }
  }
}

/**
 * Assert that no field in an object is named 'future_*'.
 */
function assertNoFutureFields(obj, context = '') {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('future_')) {
      throw new LeakageError(
        `LEAKAGE: future field '${key}' found in ${context}`,
        { field: key, context }
      );
    }
  }
}

/**
 * Assert that a candles array is strictly ordered and that the last bar
 * closed at or before asOf.
 *
 * @param {Array<{time: string|number, close: number}>} candles  chronological
 * @param {Date|string} asOf
 * @param {number} barIntervalMs  bar duration in ms (default: 60_000 for 1m)
 */
function assertCandlesOrdering(candles, asOf, barIntervalMs = 60_000) {
  if (!Array.isArray(candles) || candles.length === 0) return;
  const asOfMs = new Date(asOf).getTime();

  for (let i = 1; i < candles.length; i++) {
    const prev = new Date(candles[i - 1].time).getTime();
    const curr = new Date(candles[i].time).getTime();
    if (curr < prev) {
      throw new LeakageError('Candles are not in ascending order', { index: i, prev: candles[i-1].time, curr: candles[i].time });
    }
  }

  const lastBarOpenMs = new Date(candles[candles.length - 1].time).getTime();
  const lastBarCloseMs = lastBarOpenMs + barIntervalMs;

  if (lastBarCloseMs > asOfMs + 1000) {
    throw new LeakageError(
      `LEAKAGE: last candle bar close (${new Date(lastBarCloseMs).toISOString()}) is AFTER asOf ${asOf}`,
      { lastBarOpen: candles[candles.length - 1].time, lastBarCloseMs, asOfMs }
    );
  }
}

/**
 * Assert rolling window uses only strictly historical indices.
 * Pass the indices that would be included in the window; none must be >= tIdx.
 *
 * @param {number[]} windowIndices  indices used in the rolling window
 * @param {number} tIdx             current bar index (excluded from window)
 */
function assertRollingWindowIndices(windowIndices, tIdx) {
  for (const idx of windowIndices) {
    if (idx >= tIdx) {
      throw new LeakageError(
        `LEAKAGE: rolling window includes index ${idx} which is >= current index ${tIdx}`,
        { windowIndices, tIdx }
      );
    }
  }
}

/**
 * Assert that in a joined dataset row, label's asOf >= feature's asOf + horizonBars * barMs.
 * This prevents a label from being joined with a feature snapshot it was derived from.
 *
 * @param {string} featureAsOf
 * @param {string} labelAsOf
 * @param {number} horizonBars
 * @param {number} barMs
 */
function assertDatasetJoinOrder(featureAsOf, labelAsOf, horizonBars, barMs = 60_000) {
  const featureMs = new Date(featureAsOf).getTime();
  const labelMs   = new Date(labelAsOf).getTime();
  const minGapMs  = horizonBars * barMs;

  if (labelMs < featureMs + minGapMs - 1000) {
    throw new LeakageError(
      `LEAKAGE: label asOf (${labelAsOf}) is too early relative to feature asOf (${featureAsOf}), horizon=${horizonBars} bars`,
      { featureAsOf, labelAsOf, horizonBars, minGapMs, actualGapMs: labelMs - featureMs }
    );
  }
}

/**
 * Validate a complete feature snapshot object for leakage.
 * Call this before persisting any snapshot.
 */
function validateFeatureSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new LeakageError('Feature snapshot is null or not an object');
  }

  const required = ['symbol', 'timeframe', 'asOf', 'featureVersion', 'features', 'sourceTimestamps'];
  for (const field of required) {
    if (snapshot[field] == null) {
      throw new LeakageError(`Feature snapshot missing required field: ${field}`, { field });
    }
  }

  assertSourceTimestamps(snapshot.sourceTimestamps, snapshot.asOf);
  assertNoFutureFields(snapshot.features, 'snapshot.features');
  assertNoFutureFields(snapshot, 'snapshot');
}

module.exports = {
  LeakageError,
  assertSourceTimestamps,
  assertNoFutureFields,
  assertCandlesOrdering,
  assertRollingWindowIndices,
  assertDatasetJoinOrder,
  validateFeatureSnapshot,
};
