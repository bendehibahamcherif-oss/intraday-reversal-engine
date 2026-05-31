'use strict';

/**
 * Tradable 3-class outcome labeler.
 *
 * Label definition (tradable_v1):
 *   horizonBars         = 5 (1m bars)
 *   forwardReturnBps    = 10000 * (close_{t+5} / close_t - 1)
 *   costBufferBps       = max(estimatedRoundtripCostBps * 2, fallbackCostBps)
 *
 *   LONG    if forwardReturnBps > +costBufferBps
 *   SHORT   if forwardReturnBps < -costBufferBps
 *   NEUTRAL otherwise
 *
 * Class mapping (canonical, frozen):
 *   SHORT   = 0
 *   NEUTRAL = 1
 *   LONG    = 2
 *
 * Anti-leakage: labels are ONLY derived from bars strictly after asOf.
 * The label asOf = asOf_feature + horizonBars * barMs.
 */

const { LABEL_SPEC } = require('./featureDefinitions');
const { assertDatasetJoinOrder } = require('./featureLeakageGuards');

const { classMapping, indexToClass, horizonBars, fallbackCostBps } = LABEL_SPEC;

/**
 * Compute the label for a single feature snapshot.
 *
 * @param {string} featureAsOf     ISO timestamp of the feature bar (t)
 * @param {Array<{time, close}>} forwardCandles  candles AFTER t (must have >= horizonBars)
 * @param {number} entryPrice      close price at t
 * @param {number} [estimatedRoundtripCostBps]  actual cost from fills; fallback used if null
 * @returns {{ label, classIndex, forwardReturnBps, costBufferBps, labelAsOf, valid }}
 */
function labelSnapshot(featureAsOf, forwardCandles, entryPrice, estimatedRoundtripCostBps = null) {
  if (!forwardCandles || forwardCandles.length < horizonBars) {
    return { valid: false, reason: `Need ${horizonBars} forward bars, got ${forwardCandles?.length ?? 0}` };
  }

  const featureMs = new Date(featureAsOf).getTime();

  // Verify forward candles are all after featureAsOf
  for (const bar of forwardCandles.slice(0, horizonBars)) {
    const barMs = new Date(bar.time).getTime();
    if (barMs <= featureMs) {
      return { valid: false, reason: 'LEAKAGE: forward candle timestamp <= featureAsOf' };
    }
  }

  const exitCandle   = forwardCandles[horizonBars - 1];
  const exitPrice    = exitCandle.close;
  const labelAsOf    = exitCandle.time;

  // Anti-leakage check on the join
  assertDatasetJoinOrder(featureAsOf, labelAsOf, horizonBars);

  const forwardReturnBps = 10000 * (exitPrice / entryPrice - 1);
  const costBps          = estimatedRoundtripCostBps != null
    ? Math.max(estimatedRoundtripCostBps * 2, fallbackCostBps)
    : fallbackCostBps;

  let label;
  if (forwardReturnBps > costBps)  label = 'LONG';
  else if (forwardReturnBps < -costBps) label = 'SHORT';
  else label = 'NEUTRAL';

  return {
    valid:            true,
    label,
    classIndex:       classMapping[label],
    forwardReturnBps: Number(forwardReturnBps.toFixed(4)),
    costBufferBps:    Number(costBps.toFixed(4)),
    entryPrice,
    exitPrice,
    featureAsOf,
    labelAsOf:        new Date(labelAsOf).toISOString(),
    horizonBars,
    labelSpecVersion: LABEL_SPEC.version,
  };
}

/**
 * Batch label a sorted array of (featureAsOf, entryPrice) pairs given a full candle series.
 *
 * @param {Array<{asOf: string, entryPrice: number}>} featureRows  sorted chronologically
 * @param {Array<{time: string, close: number}>} allCandles        full candle history (chronological)
 * @param {number} [estimatedRoundtripCostBps]
 * @returns {Array} labeled rows, some may have valid=false (insufficient forward data)
 */
function batchLabel(featureRows, allCandles, estimatedRoundtripCostBps = null) {
  // Build a map from bar time (ms) to candle index for fast lookup
  const timeToIdx = new Map();
  for (let i = 0; i < allCandles.length; i++) {
    timeToIdx.set(new Date(allCandles[i].time).getTime(), i);
  }

  return featureRows.map((row) => {
    const asOfMs = new Date(row.asOf).getTime();
    // Find first candle strictly after asOf
    const startIdx = allCandles.findIndex((c) => new Date(c.time).getTime() > asOfMs);
    if (startIdx === -1 || startIdx + horizonBars > allCandles.length) {
      return { ...row, valid: false, reason: 'Insufficient forward candles in dataset' };
    }
    const forwardCandles = allCandles.slice(startIdx, startIdx + horizonBars);
    try {
      return { ...row, ...labelSnapshot(row.asOf, forwardCandles, row.entryPrice, estimatedRoundtripCostBps) };
    } catch (err) {
      return { ...row, valid: false, reason: err.message };
    }
  });
}

/**
 * Return distribution of classes in a labeled set.
 */
function classDistribution(labeledRows) {
  const dist = { SHORT: 0, NEUTRAL: 0, LONG: 0, total: 0 };
  for (const row of labeledRows) {
    if (!row.valid) continue;
    dist[row.label]++;
    dist.total++;
  }
  return dist;
}

module.exports = { labelSnapshot, batchLabel, classDistribution, classMapping, indexToClass };
