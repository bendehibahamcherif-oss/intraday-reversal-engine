'use strict';

/**
 * Unit tests for featureService.js and featureLeakageGuards.js
 * Run with: node server-deliverables/ml/__tests__/featureService.test.js
 */

const { computeFeatures, toFeatureVector, FEATURE_NAMES } = require('../featureService');
const {
  LeakageError, assertSourceTimestamps, assertCandlesOrdering,
  assertDatasetJoinOrder, validateFeatureSnapshot,
} = require('../featureLeakageGuards');
const { chronologicalSplit, validateSplit } = require('../datasetSplit');
const { labelSnapshot, batchLabel, classDistribution } = require('../outcomeLabeler');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertApprox(actual, expected, tol = 1e-6, msg) {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(msg || `Expected ~${expected}, got ${actual}`);
  }
}

// ── Synthetic candle builder ─────────────────────────────────────────────────
function makeCandles(closes, baseTime = new Date('2026-01-05T14:00:00Z'), volumes = null) {
  return closes.map((close, i) => ({
    time:   new Date(baseTime.getTime() + i * 60_000).toISOString(),
    open:   close * 0.999,
    high:   close * 1.002,
    low:    close * 0.998,
    close,
    volume: volumes ? volumes[i] : 1000 + i * 10,
  }));
}

const BASE_TIME = new Date('2026-01-05T14:00:00Z');
const CLOSES = [100, 100.1, 100.05, 100.2, 100.15, 100.3, 100.25, 100.4, 100.35, 100.5,
                100.45, 100.6, 100.55, 100.7, 100.65, 100.8, 100.75, 100.9, 100.85, 101,
                100.95, 101.1, 101.05, 101.2];
const CANDLES = makeCandles(CLOSES, BASE_TIME);
const ASSET  = 'SPY';
const AS_OF  = new Date(BASE_TIME.getTime() + (CLOSES.length - 1) * 60_000 + 60_000).toISOString();

// ── ret_1m test ──────────────────────────────────────────────────────────────
console.log('\n=== Feature Computation ===');

test('ret_1m = ln(close_t / close_{t-1})', () => {
  const snap = computeFeatures({ symbol: ASSET, timeframe: '1m', asOf: AS_OF, candles: CANDLES });
  const n = CLOSES.length;
  const expected = Math.log(CLOSES[n - 1] / CLOSES[n - 2]);
  assertApprox(snap.features.ret_1m, expected, 1e-5, `ret_1m: ${snap.features.ret_1m} !== ${expected}`);
});

test('ret_5m = ln(close_t / close_{t-5})', () => {
  const snap = computeFeatures({ symbol: ASSET, timeframe: '1m', asOf: AS_OF, candles: CANDLES });
  const n = CLOSES.length;
  const expected = Math.log(CLOSES[n - 1] / CLOSES[n - 6]);
  assertApprox(snap.features.ret_5m, expected, 1e-5);
});

test('ret_15m = ln(close_t / close_{t-15})', () => {
  const snap = computeFeatures({ symbol: ASSET, timeframe: '1m', asOf: AS_OF, candles: CANDLES });
  const n = CLOSES.length;
  const expected = Math.log(CLOSES[n - 1] / CLOSES[n - 16]);
  assertApprox(snap.features.ret_15m, expected, 1e-5);
});

test('vwap_gap = (close - vwap) / vwap', () => {
  const vwap = 100.5;
  const snap = computeFeatures({ symbol: ASSET, timeframe: '1m', asOf: AS_OF, candles: CANDLES, vwap, vwapTimestamp: CANDLES[CANDLES.length - 1].time });
  const n = CLOSES.length;
  const expected = (CLOSES[n - 1] - vwap) / vwap;
  assertApprox(snap.features.vwap_gap, expected, 1e-5);
});

test('rsi14 is non-null and in [0, 100]', () => {
  const snap = computeFeatures({ symbol: ASSET, timeframe: '1m', asOf: AS_OF, candles: CANDLES });
  assert(snap.features.rsi14 != null, 'rsi14 is null');
  assert(snap.features.rsi14 >= 0 && snap.features.rsi14 <= 100, `rsi14 out of range: ${snap.features.rsi14}`);
});

test('ema_spread_9_20 is non-null', () => {
  const snap = computeFeatures({ symbol: ASSET, timeframe: '1m', asOf: AS_OF, candles: CANDLES });
  assert(snap.features.ema_spread_9_20 != null, 'ema_spread_9_20 is null');
  assert(Number.isFinite(snap.features.ema_spread_9_20));
});

test('ema_cross_event is -1, 0, or +1', () => {
  const snap = computeFeatures({ symbol: ASSET, timeframe: '1m', asOf: AS_OF, candles: CANDLES });
  assert([-1, 0, 1].includes(snap.features.ema_cross_event), `unexpected ema_cross_event: ${snap.features.ema_cross_event}`);
});

test('vol_spike_20 > 0 with sufficient bars', () => {
  const snap = computeFeatures({ symbol: ASSET, timeframe: '1m', asOf: AS_OF, candles: CANDLES });
  assert(snap.features.vol_spike_20 != null && snap.features.vol_spike_20 > 0, `vol_spike_20: ${snap.features.vol_spike_20}`);
});

test('poc_distance exact', () => {
  const poc = 100.3;
  const snap = computeFeatures({
    symbol: ASSET, timeframe: '1m', asOf: AS_OF, candles: CANDLES,
    poc, volumeProfileTimestamp: CANDLES[CANDLES.length - 1].time,
  });
  const n = CLOSES.length;
  const expected = (CLOSES[n - 1] - poc) / CLOSES[n - 1];
  assertApprox(snap.features.poc_distance, expected, 1e-5);
});

test('cvd_delta_5 computed correctly', () => {
  const cvdHistory = CANDLES.map((c, i) => ({ time: c.time, value: i * 100 }));
  const snap = computeFeatures({ symbol: ASSET, timeframe: '1m', asOf: AS_OF, candles: CANDLES, cvdHistory });
  assert(snap.features.cvd_delta_5 != null, 'cvd_delta_5 is null');
  assert(Number.isFinite(snap.features.cvd_delta_5));
});

test('footprint_imbalance_recent computed correctly', () => {
  const footprintBars = CANDLES.slice(-5).map((c, i) => ({
    time: c.time, upImbalances: 3 + i, downImbalances: 1 + i,
  }));
  const snap = computeFeatures({ symbol: ASSET, timeframe: '1m', asOf: AS_OF, candles: CANDLES, footprintBars });
  const fb = footprintBars.slice(-3);
  const up = fb.reduce((s, b) => s + b.upImbalances, 0);
  const dn = fb.reduce((s, b) => s + b.downImbalances, 0);
  const expected = (up - dn) / 3;
  assertApprox(snap.features.footprint_imbalance_recent, expected, 1e-5);
});

test('feature vector has correct length', () => {
  const snap = computeFeatures({ symbol: ASSET, timeframe: '1m', asOf: AS_OF, candles: CANDLES });
  const vec = toFeatureVector(snap);
  assert(vec.length === FEATURE_NAMES.length, `vector length ${vec.length} !== ${FEATURE_NAMES.length}`);
});

test('null features become 0 in vector', () => {
  // Only 5 candles → many features will be null
  const shortCandles = makeCandles([100, 100.1, 100.2, 100.3, 100.4], BASE_TIME);
  const shortAsOf = new Date(BASE_TIME.getTime() + 5 * 60_000).toISOString();
  const snap = computeFeatures({ symbol: ASSET, timeframe: '1m', asOf: shortAsOf, candles: shortCandles });
  const vec = toFeatureVector(snap);
  assert(vec.every((v) => Number.isFinite(v)), 'All vector values should be finite');
});

// ── Leakage guard tests ──────────────────────────────────────────────────────
console.log('\n=== Leakage Guards ===');

test('assertSourceTimestamps rejects future timestamp', () => {
  let threw = false;
  try {
    assertSourceTimestamps(
      { cvd: new Date(Date.now() + 60_000).toISOString() },
      new Date().toISOString()
    );
  } catch (err) {
    threw = err instanceof LeakageError;
  }
  assert(threw, 'Should have thrown LeakageError for future CVD timestamp');
});

test('assertSourceTimestamps passes for equal timestamp', () => {
  const now = new Date().toISOString();
  assertSourceTimestamps({ candles: now }, now); // should not throw
});

test('assertCandlesOrdering rejects unordered candles', () => {
  const candles = [
    { time: '2026-01-05T14:02:00Z', close: 100.1 },
    { time: '2026-01-05T14:01:00Z', close: 100.0 }, // out of order
  ];
  let threw = false;
  try { assertCandlesOrdering(candles, '2026-01-05T15:00:00Z'); } catch (err) { threw = true; }
  assert(threw, 'Should have thrown for out-of-order candles');
});

test('assertDatasetJoinOrder rejects label too close to feature', () => {
  let threw = false;
  try {
    assertDatasetJoinOrder('2026-01-05T14:00:00Z', '2026-01-05T14:02:00Z', 5); // 2m < 5m gap
  } catch (err) { threw = err instanceof LeakageError; }
  assert(threw, 'Should throw for insufficient join gap');
});

test('validateFeatureSnapshot rejects missing fields', () => {
  let threw = false;
  try { validateFeatureSnapshot({ symbol: 'SPY' }); } catch (err) { threw = true; }
  assert(threw, 'Should throw for incomplete snapshot');
});

test('featureService rejects source timestamp after asOf', () => {
  const futureTs = new Date(Date.now() + 600_000).toISOString();
  const asOf = new Date().toISOString();
  let threw = false;
  try {
    computeFeatures({ symbol: 'SPY', timeframe: '1m', asOf, candles: CANDLES, vwapTimestamp: futureTs, vwap: 100 });
  } catch (err) { threw = err instanceof LeakageError; }
  assert(threw, 'Should throw LeakageError for future vwapTimestamp');
});

// ── Dataset split tests ──────────────────────────────────────────────────────
console.log('\n=== Dataset Split ===');

test('chronological split produces non-overlapping sets', () => {
  const { trainIdx, valIdx, testIdx } = chronologicalSplit(100);
  const trainSet = new Set(trainIdx);
  const valSet   = new Set(valIdx);
  const testSet  = new Set(testIdx);
  for (const i of valIdx) assert(!trainSet.has(i), `train/val overlap at ${i}`);
  for (const i of testIdx) assert(!trainSet.has(i), `train/test overlap at ${i}`);
  for (const i of testIdx) assert(!valSet.has(i), `val/test overlap at ${i}`);
});

test('split respects gap >= horizonBars', () => {
  const { trainIdx, valIdx, testIdx, meta } = chronologicalSplit(100);
  const { valid, errors } = validateSplit(trainIdx, valIdx, testIdx, meta.gapSize);
  assert(valid, 'Split validation failed: ' + errors.join(', '));
});

test('split is chronologically ordered', () => {
  const { trainIdx, valIdx, testIdx } = chronologicalSplit(100);
  assert(Math.max(...trainIdx) < Math.min(...valIdx), 'train must precede val');
  assert(Math.max(...valIdx)   < Math.min(...testIdx), 'val must precede test');
});

test('split fails gracefully on tiny dataset', () => {
  let threw = false;
  try { chronologicalSplit(10); } catch { threw = true; }
  assert(threw, 'Should throw for dataset < 30');
});

// ── Labeling tests ───────────────────────────────────────────────────────────
console.log('\n=== Outcome Labeling ===');

test('LONG label for strong positive return', () => {
  const entry    = 100;
  const fwd      = makeCandles([100.1, 100.2, 100.3, 100.4, 100.5], new Date('2026-01-05T14:25:00Z'));
  const result   = labelSnapshot('2026-01-05T14:24:00Z', fwd, entry, 2);
  assert(result.valid, 'Label should be valid');
  assert(result.label === 'LONG', `Expected LONG, got ${result.label} (fwdBps=${result.forwardReturnBps})`);
});

test('SHORT label for strong negative return', () => {
  const entry = 100;
  const fwd   = makeCandles([99.9, 99.8, 99.7, 99.6, 99.5], new Date('2026-01-05T14:25:00Z'));
  const result = labelSnapshot('2026-01-05T14:24:00Z', fwd, entry, 2);
  assert(result.valid, 'Label should be valid');
  assert(result.label === 'SHORT', `Expected SHORT, got ${result.label}`);
});

test('NEUTRAL label for small return within cost buffer', () => {
  const entry = 100;
  const fwd   = makeCandles([100.001, 100.002, 100.001, 100.002, 100.001], new Date('2026-01-05T14:25:00Z'));
  const result = labelSnapshot('2026-01-05T14:24:00Z', fwd, entry, 2);
  assert(result.valid, 'Label should be valid');
  assert(result.label === 'NEUTRAL', `Expected NEUTRAL, got ${result.label}`);
});

test('label rejects insufficient forward bars', () => {
  const fwd = makeCandles([100.1, 100.2], new Date('2026-01-05T14:25:00Z'));
  const result = labelSnapshot('2026-01-05T14:24:00Z', fwd, 100);
  assert(!result.valid, 'Should be invalid with only 2 forward bars');
});

test('class distribution sums correctly', () => {
  const rows = [
    { valid: true, label: 'LONG' }, { valid: true, label: 'SHORT' },
    { valid: true, label: 'NEUTRAL' }, { valid: false }, { valid: true, label: 'LONG' },
  ];
  const dist = classDistribution(rows);
  assert(dist.LONG === 2, `LONG: ${dist.LONG}`);
  assert(dist.SHORT === 1, `SHORT: ${dist.SHORT}`);
  assert(dist.NEUTRAL === 1, `NEUTRAL: ${dist.NEUTRAL}`);
  assert(dist.total === 4, `total: ${dist.total}`);
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
