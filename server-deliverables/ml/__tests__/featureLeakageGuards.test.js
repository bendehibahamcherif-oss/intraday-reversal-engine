'use strict';

/**
 * Dedicated anti-leakage guard tests.
 * Run with: node server-deliverables/ml/__tests__/featureLeakageGuards.test.js
 */

const {
  LeakageError,
  assertSourceTimestamps,
  assertNoFutureFields,
  assertCandlesOrdering,
  assertRollingWindowIndices,
  assertDatasetJoinOrder,
  validateFeatureSnapshot,
} = require('../featureLeakageGuards');
const { computeFeatures } = require('../featureService');
const { chronologicalSplit, validateSplit } = require('../datasetSplit');

let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}: ${err.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Assertion failed'); }

function makeCandles(closes, base = new Date('2026-01-05T14:00:00Z')) {
  return closes.map((close, i) => ({
    time: new Date(base.getTime() + i * 60_000).toISOString(),
    close, open: close, high: close, low: close, volume: 1000,
  }));
}

console.log('\n=== Anti-Leakage: Source Timestamps ===');

test('Rejects volumeProfile timestamp after asOf', () => {
  const asOf = '2026-01-05T14:30:00Z';
  const future = '2026-01-05T14:31:00Z';
  let threw = false;
  try { assertSourceTimestamps({ volumeProfile: future }, asOf); } catch (e) { threw = e instanceof LeakageError; }
  assert(threw, 'Should throw for future volumeProfile timestamp');
});

test('Rejects footprint timestamp after asOf', () => {
  const asOf = '2026-01-05T14:30:00Z';
  let threw = false;
  try { assertSourceTimestamps({ footprint: '2026-01-05T14:32:00Z' }, asOf); } catch (e) { threw = e instanceof LeakageError; }
  assert(threw, 'Should throw for future footprint timestamp');
});

test('Rejects CVD timestamp after asOf', () => {
  const asOf = '2026-01-05T14:30:00Z';
  let threw = false;
  try { assertSourceTimestamps({ cvd: '2026-01-05T14:31:00Z' }, asOf); } catch (e) { threw = e instanceof LeakageError; }
  assert(threw, 'Should throw for future CVD timestamp');
});

test('Accepts all timestamps <= asOf', () => {
  const asOf = '2026-01-05T14:30:00Z';
  assertSourceTimestamps({
    candles: '2026-01-05T14:30:00Z',
    vwap:    '2026-01-05T14:29:00Z',
    cvd:     '2026-01-05T14:28:00Z',
    footprint: '2026-01-05T14:25:00Z',
    volumeProfile: '2026-01-05T14:20:00Z',
  }, asOf); // should not throw
});

test('Accepts null source timestamps (missing data)', () => {
  assertSourceTimestamps({ candles: null, cvd: null }, '2026-01-05T14:30:00Z');
});

console.log('\n=== Anti-Leakage: Future Fields ===');

test('Rejects object with future_ field', () => {
  let threw = false;
  try { assertNoFutureFields({ close: 100, future_close: 101 }, 'features'); } catch (e) { threw = true; }
  assert(threw, 'Should throw for future_close field');
});

test('Accepts object without future_ fields', () => {
  assertNoFutureFields({ ret_1m: 0.001, rsi14: 55, ema_spread_9_20: 0.0005 }, 'features');
});

console.log('\n=== Anti-Leakage: Candle Ordering ===');

test('Rejects unsorted candles', () => {
  const candles = [
    { time: '2026-01-05T14:02:00Z', close: 100.2 },
    { time: '2026-01-05T14:01:00Z', close: 100.1 },
  ];
  let threw = false;
  try { assertCandlesOrdering(candles, '2026-01-05T14:10:00Z'); } catch (e) { threw = true; }
  assert(threw, 'Should reject unsorted candles');
});

test('Rejects candle bar that closes after asOf', () => {
  const asOf = '2026-01-05T14:01:00Z';
  const candles = [{ time: '2026-01-05T14:01:00Z', close: 100 }]; // bar closes at 14:02, after asOf 14:01
  let threw = false;
  try { assertCandlesOrdering(candles, asOf, 60_000); } catch (e) { threw = e instanceof LeakageError; }
  assert(threw, 'Should reject bar that closes after asOf');
});

test('Accepts well-ordered candles within asOf', () => {
  const candles = makeCandles([100, 100.1, 100.2]);
  const asOf = new Date(new Date('2026-01-05T14:00:00Z').getTime() + 4 * 60_000).toISOString();
  assertCandlesOrdering(candles, asOf); // should not throw
});

console.log('\n=== Anti-Leakage: Rolling Window ===');

test('assertRollingWindowIndices rejects index >= tIdx', () => {
  let threw = false;
  try { assertRollingWindowIndices([0, 1, 2, 3, 4, 5], 5); } catch (e) { threw = true; }
  assert(threw, 'Should reject window including tIdx=5');
});

test('assertRollingWindowIndices accepts strictly historical indices', () => {
  assertRollingWindowIndices([0, 1, 2, 3, 4], 5); // all < 5
});

console.log('\n=== Anti-Leakage: Dataset Join ===');

test('Rejects label joined with feature when gap < horizonBars', () => {
  // Feature at 14:00, label at 14:03, horizon=5 bars (need 5 min gap)
  let threw = false;
  try { assertDatasetJoinOrder('2026-01-05T14:00:00Z', '2026-01-05T14:03:00Z', 5); } catch (e) { threw = e instanceof LeakageError; }
  assert(threw, 'Should throw for insufficient gap between feature and label');
});

test('Accepts label at exact horizon distance', () => {
  assertDatasetJoinOrder('2026-01-05T14:00:00Z', '2026-01-05T14:05:00Z', 5);
});

test('Accepts label well beyond horizon', () => {
  assertDatasetJoinOrder('2026-01-05T14:00:00Z', '2026-01-05T14:30:00Z', 5);
});

console.log('\n=== Anti-Leakage: Dataset Split Gap ===');

test('Split between train and val has >= horizonBars gap', () => {
  const { trainIdx, valIdx, testIdx, meta } = chronologicalSplit(200, { horizonBars: 5 });
  const trainMax = Math.max(...trainIdx);
  const valMin   = Math.min(...valIdx);
  assert(valMin - trainMax - 1 >= 5, `Gap train→val: ${valMin - trainMax - 1} < 5`);
});

test('Split between val and test has >= horizonBars gap', () => {
  const { valIdx, testIdx, meta } = chronologicalSplit(200, { horizonBars: 5 });
  const valMax  = Math.max(...valIdx);
  const testMin = Math.min(...testIdx);
  assert(testMin - valMax - 1 >= 5, `Gap val→test: ${testMin - valMax - 1} < 5`);
});

test('No index appears in multiple splits', () => {
  const { trainIdx, valIdx, testIdx } = chronologicalSplit(200);
  const trainSet = new Set(trainIdx);
  for (const i of valIdx)  assert(!trainSet.has(i), `Overlap train/val at ${i}`);
  for (const i of testIdx) assert(!trainSet.has(i), `Overlap train/test at ${i}`);
  const valSet = new Set(valIdx);
  for (const i of testIdx) assert(!valSet.has(i), `Overlap val/test at ${i}`);
});

console.log('\n=== Anti-Leakage: Full Feature Snapshot Validation ===');

test('validateFeatureSnapshot rejects snapshot with future source timestamp', () => {
  const snap = {
    symbol: 'SPY', timeframe: '1m',
    asOf:   '2026-01-05T14:30:00Z',
    featureVersion: 'p1_v1', features: { ret_1m: 0.001 },
    sourceTimestamps: { candles: '2026-01-05T14:31:00Z' }, // future!
  };
  let threw = false;
  try { validateFeatureSnapshot(snap); } catch (e) { threw = e instanceof LeakageError; }
  assert(threw, 'Should throw for future sourceTimestamp in snapshot');
});

test('validateFeatureSnapshot rejects snapshot with future_ feature field', () => {
  const snap = {
    symbol: 'SPY', timeframe: '1m',
    asOf:   '2026-01-05T14:30:00Z',
    featureVersion: 'p1_v1',
    features: { ret_1m: 0.001, future_ret: 0.005 }, // LEAKAGE
    sourceTimestamps: { candles: '2026-01-05T14:29:00Z' },
  };
  let threw = false;
  try { validateFeatureSnapshot(snap); } catch (e) { threw = e instanceof LeakageError; }
  assert(threw, 'Should throw for future_ field in features');
});

test('validateFeatureSnapshot passes valid snapshot', () => {
  const candles = makeCandles(Array.from({ length: 25 }, (_, i) => 100 + i * 0.1));
  const asOf    = new Date(new Date('2026-01-05T14:00:00Z').getTime() + 26 * 60_000).toISOString();
  const snap = computeFeatures({ symbol: 'SPY', timeframe: '1m', asOf, candles });
  validateFeatureSnapshot(snap); // should not throw
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
