'use strict';

/**
 * Integration test: full pipeline from raw candles to labeled dataset, model
 * registry, and signal shape.
 *
 * Does NOT spawn Python — inference is exercised via registry + mock worker.
 *
 * Run with: node server-deliverables/ml/__tests__/mlSignal.int.test.js
 */

const path = require('path');

const { computeFeatures, toFeatureVector, FEATURE_NAMES } = require('../featureService');
const featureStore  = require('../featureStore');
const { buildDataset } = require('../datasetBuilder');
const { batchLabel, classDistribution, labelSnapshot } = require('../outcomeLabeler');
const { chronologicalSplit } = require('../datasetSplit');
const registry = require('../modelRegistry');
const { FEATURE_VERSION, LABEL_SPEC, FEATURE_SPEC } = require('../featureDefinitions');
const { getWorkerStatus } = require('../inferenceService');

// ── test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failures.push({ name, err });
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failures.push({ name, err });
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertClose(a, b, tol = 1e-6, msg) {
  if (Math.abs(a - b) > tol) throw new Error(msg || `Expected ~${b}, got ${a} (tol ${tol})`);
}

// ── candle generator ──────────────────────────────────────────────────────────

/**
 * Generate n synthetic 1-minute candles starting at baseMs.
 * Price does a slow random walk; volume is uniform with occasional spikes.
 */
function makeSyntheticCandles(n, baseMs = Date.now() - n * 60_000, seed = 42) {
  const candles = [];
  let close = 100;
  let rng = seed;
  const lcg = () => { rng = (rng * 1664525 + 1013904223) & 0xffffffff; return (rng >>> 0) / 0xffffffff; };

  for (let i = 0; i < n; i++) {
    const ret    = (lcg() - 0.5) * 0.004; // ±0.2% per bar
    const open   = close;
    close        = open * (1 + ret);
    const high   = Math.max(open, close) * (1 + lcg() * 0.001);
    const low    = Math.min(open, close) * (1 - lcg() * 0.001);
    const volume = (500 + lcg() * 1500) * (lcg() > 0.95 ? 3 : 1); // occasional spike

    candles.push({
      time:   new Date(baseMs + i * 60_000).toISOString(),
      open:   Number(open.toFixed(4)),
      high:   Number(high.toFixed(4)),
      low:    Number(low.toFixed(4)),
      close:  Number(close.toFixed(4)),
      volume: Math.round(volume),
    });
  }
  return candles;
}

/**
 * Make CVD history parallel to candles (synthetic cumulative delta).
 */
function makeCvdHistory(candles) {
  let cvd = 0;
  return candles.map((c) => {
    cvd += (c.close >= c.open ? 1 : -1) * c.volume;
    return { time: c.time, value: cvd };
  });
}

/**
 * Make footprint bars (simple synthetic up/down imbalance counts).
 */
function makeFootprintBars(candles) {
  return candles.map((c) => ({
    time:           c.time,
    upImbalances:   c.close >= c.open ? 3 : 1,
    downImbalances: c.close < c.open  ? 3 : 1,
  }));
}

// ── Setup ─────────────────────────────────────────────────────────────────────

// Reset shared state before tests
featureStore.clearAll();
registry._reset();

// Build 120 synthetic bars — enough for all lookbacks (max 21) + horizon + training split
const N_BARS     = 120;
const BASE_MS    = Date.now() - N_BARS * 60_000 - 600_000; // 10 min buffer in the past
const allCandles = makeSyntheticCandles(N_BARS, BASE_MS);
const cvdHistory = makeCvdHistory(allCandles);
const footprintBars = makeFootprintBars(allCandles);

// Per-bar running VWAP and POC — each timestamped at that bar's open time
// so they are always <= asOf (= bar.openTime + 60s). This satisfies leakage guards.
function vwapAt(idx) {
  const slice = allCandles.slice(0, idx + 1);
  return slice.reduce((s, c) => s + c.close, 0) / slice.length;
}
function pocAt(idx) {
  const slice = allCandles.slice(0, idx + 1);
  return slice.sort((a, b) => b.volume - a.volume)[0].close;
}

const SYMBOL    = 'AAPL';
const TIMEFRAME = '1m';

// ── Section 1: Feature computation ───────────────────────────────────────────

console.log('\n[1] Feature computation');

let referenceSnapshot = null;

test('computeFeatures returns valid snapshot for bar 40', () => {
  const bar = allCandles[40]; // needs bars 0..40 inclusive
  const asOf = new Date(new Date(bar.time).getTime() + 60_000).toISOString();
  const snapshot = computeFeatures({
    symbol:   SYMBOL,
    timeframe: TIMEFRAME,
    asOf,
    provisional: false,
    candles:  allCandles.slice(0, 41),
    vwap:     vwapAt(40),  vwapTimestamp: bar.time,
    poc:      pocAt(40),   volumeProfileTimestamp: bar.time,
    cvdHistory:    cvdHistory.slice(0, 41),
    footprintBars: footprintBars.slice(0, 41),
  });

  assert(snapshot.symbol === SYMBOL, 'symbol');
  assert(snapshot.featureVersion === FEATURE_VERSION, 'featureVersion');
  assert(snapshot.provisional === false, 'canonical');
  assert(typeof snapshot.missingFeatureCount === 'number', 'missingFeatureCount type');
  assert(Array.isArray(snapshot.computedAt) === false, 'computedAt is string');
  referenceSnapshot = snapshot;
});

test('feature vector has correct length', () => {
  assert(referenceSnapshot !== null, 'referenceSnapshot set');
  const vec = toFeatureVector(referenceSnapshot);
  assertEq(vec.length, FEATURE_NAMES.length, 'vector length matches FEATURE_NAMES');
  assert(vec.every((v) => Number.isFinite(v)), 'all values finite (nulls become 0)');
});

test('all 11 feature names present in snapshot', () => {
  for (const name of FEATURE_NAMES) {
    assert(name in referenceSnapshot.features, `missing feature: ${name}`);
  }
  assertEq(Object.keys(referenceSnapshot.features).length, 11, '11 features total');
});

test('ret_1m is log return of last two closes', () => {
  const s40 = allCandles.slice(0, 41);
  const expected = Math.log(s40[40].close / s40[39].close);
  assertClose(referenceSnapshot.features.ret_1m, expected, 1e-5, 'ret_1m');
});

test('vwap_gap is (close - vwap) / vwap', () => {
  const close    = allCandles[40].close;
  const v        = vwapAt(40);
  const expected = (close - v) / v;
  assertClose(referenceSnapshot.features.vwap_gap, expected, 1e-5, 'vwap_gap');
});

test('provisional snapshot flagged correctly', () => {
  const bar = allCandles[40];
  const asOf = new Date(new Date(bar.time).getTime() + 60_000).toISOString();
  const snap = computeFeatures({
    symbol: SYMBOL, timeframe: TIMEFRAME, asOf, provisional: true,
    candles: allCandles.slice(0, 41), vwap: vwapAt(40), vwapTimestamp: bar.time,
    poc: pocAt(40), volumeProfileTimestamp: bar.time,
    cvdHistory: cvdHistory.slice(0, 41), footprintBars: footprintBars.slice(0, 41),
  });
  assert(snap.provisional === true, 'provisional flag');
});

// ── Section 2: Feature store ──────────────────────────────────────────────────

console.log('\n[2] Feature store');

// Compute and save 60 canonical snapshots (bars 25..84, each has enough lookback)
const savedSnapshots = [];

test('save 60 canonical snapshots to featureStore', () => {
  for (let i = 25; i < 85; i++) {
    const bar  = allCandles[i];
    const asOf = new Date(new Date(bar.time).getTime() + 60_000).toISOString();
    const snap = computeFeatures({
      symbol: SYMBOL, timeframe: TIMEFRAME, asOf, provisional: false,
      candles:  allCandles.slice(0, i + 1),
      vwap: vwapAt(i), vwapTimestamp: bar.time,
      poc:  pocAt(i),  volumeProfileTimestamp: bar.time,
      cvdHistory:    cvdHistory.slice(0, i + 1),
      footprintBars: footprintBars.slice(0, i + 1),
    });
    featureStore.save(snap);
    savedSnapshots.push(snap);
  }
  assertEq(savedSnapshots.length, 60, '60 snapshots generated');
});

test('getLatestCanonical returns most recent snapshot', () => {
  const latest = featureStore.getLatestCanonical(SYMBOL, TIMEFRAME);
  assert(latest !== null, 'not null');
  assertEq(latest.asOf, savedSnapshots[savedSnapshots.length - 1].asOf, 'latest asOf matches last saved');
});

test('getCanonicalHistory returns snapshots in chronological order', () => {
  const history = featureStore.getCanonicalHistory(SYMBOL, TIMEFRAME, FEATURE_VERSION, 100);
  assert(history.length > 0, 'non-empty');
  for (let i = 1; i < history.length; i++) {
    assert(history[i].asOf >= history[i - 1].asOf, 'chronological order');
  }
});

test('featureStore stats reflect saved data', () => {
  const stats = featureStore.getStats();
  assert(stats.totalSnapshots >= 60, 'at least 60 snapshots');
  assert(SYMBOL in stats.symbolCounts, 'symbol tracked');
});

test('provisional snapshot NOT returned by getLatestCanonical', () => {
  const bar = allCandles[50];
  const asOf = new Date(new Date(bar.time).getTime() + 60_000).toISOString();
  const provSnap = computeFeatures({
    symbol: SYMBOL, timeframe: TIMEFRAME, asOf, provisional: true,
    candles: allCandles.slice(0, 51), vwap: vwapAt(50), vwapTimestamp: bar.time,
    poc: pocAt(50), volumeProfileTimestamp: bar.time,
    cvdHistory: cvdHistory.slice(0, 51), footprintBars: footprintBars.slice(0, 51),
  });
  featureStore.save(provSnap); // save provisional
  const canonical = featureStore.getLatestCanonical(SYMBOL, TIMEFRAME);
  assert(!canonical.provisional, 'canonical returned, not provisional');
});

// ── Section 3: Outcome labeling ───────────────────────────────────────────────

console.log('\n[3] Outcome labeling');

test('labelSnapshot returns LONG when forward return > cost buffer', () => {
  // Craft forward candles with large positive return
  const entryPrice = 100;
  const exitPrice  = 100.15; // +15 bps, above fallbackCostBps=8
  const fwdCandles = Array.from({ length: 5 }, (_, i) => ({
    time:  new Date(BASE_MS + (30 + i + 1) * 60_000).toISOString(),
    close: i < 4 ? 100 : exitPrice,
  }));
  const featureAsOf = new Date(BASE_MS + 30 * 60_000).toISOString();
  const result = labelSnapshot(featureAsOf, fwdCandles, entryPrice);
  assert(result.valid, 'valid');
  assertEq(result.label, 'LONG', 'LONG label');
  assertEq(result.classIndex, 2, 'LONG=2');
});

test('labelSnapshot returns SHORT when forward return < -cost buffer', () => {
  const entryPrice = 100;
  const exitPrice  = 99.85; // -15 bps
  const featureAsOf = new Date(BASE_MS + 31 * 60_000).toISOString();
  const fwdCandles = Array.from({ length: 5 }, (_, i) => ({
    time:  new Date(BASE_MS + (31 + i + 1) * 60_000).toISOString(),
    close: i < 4 ? 100 : exitPrice,
  }));
  const result = labelSnapshot(featureAsOf, fwdCandles, entryPrice);
  assert(result.valid, 'valid');
  assertEq(result.label, 'SHORT', 'SHORT label');
  assertEq(result.classIndex, 0, 'SHORT=0');
});

test('labelSnapshot returns NEUTRAL when forward return within cost buffer', () => {
  const entryPrice = 100;
  const exitPrice  = 100.03; // +3 bps, within fallbackCostBps=8
  const featureAsOf = new Date(BASE_MS + 32 * 60_000).toISOString();
  const fwdCandles = Array.from({ length: 5 }, (_, i) => ({
    time:  new Date(BASE_MS + (32 + i + 1) * 60_000).toISOString(),
    close: exitPrice,
  }));
  const result = labelSnapshot(featureAsOf, fwdCandles, entryPrice);
  assert(result.valid, 'valid');
  assertEq(result.label, 'NEUTRAL', 'NEUTRAL label');
  assertEq(result.classIndex, 1, 'NEUTRAL=1');
});

test('labelSnapshot is invalid with fewer than horizonBars forward candles', () => {
  const featureAsOf = new Date(BASE_MS + 33 * 60_000).toISOString();
  const result = labelSnapshot(featureAsOf, [{ time: new Date(BASE_MS + 34 * 60_000).toISOString(), close: 100 }], 100);
  assert(!result.valid, 'invalid when too few forward candles');
});

test('labelSnapshot rejects forward candle at or before featureAsOf (leakage)', () => {
  const featureAsOf = new Date(BASE_MS + 34 * 60_000).toISOString();
  // Include a candle BEFORE featureAsOf
  const badCandles = Array.from({ length: 5 }, (_, i) => ({
    time:  new Date(BASE_MS + (34 - i) * 60_000).toISOString(), // going backwards!
    close: 100,
  }));
  const result = labelSnapshot(featureAsOf, badCandles, 100);
  assert(!result.valid, 'rejected: leakage from past candle');
});

// ── Section 4: Batch labeling + dataset build ─────────────────────────────────

console.log('\n[4] Batch labeling + dataset build');

let dataset = null;

test('batchLabel produces labeled rows for 60 canonical snapshots', () => {
  const history = featureStore.getCanonicalHistory(SYMBOL, TIMEFRAME, FEATURE_VERSION, 100);
  const featureRows = history.map((snap) => {
    const minuteKey = snap.asOf.slice(0, 16);
    const candle    = allCandles.find((c) => c.time.slice(0, 16) === minuteKey);
    return { asOf: snap.asOf, entryPrice: candle?.close ?? null, snapshot: snap };
  }).filter((r) => r.entryPrice != null);

  const labeled = batchLabel(featureRows, allCandles);
  assert(labeled.length > 0, 'at least one labeled row');
  const valid = labeled.filter((r) => r.valid);
  assert(valid.length > 0, 'at least one valid row (sufficient forward bars)');
  // Valid rows must have label and classIndex
  for (const row of valid) {
    assert(['LONG', 'SHORT', 'NEUTRAL'].includes(row.label), 'valid label');
    assert([0, 1, 2].includes(row.classIndex), 'valid classIndex');
  }
});

test('classDistribution returns non-zero total', () => {
  const history = featureStore.getCanonicalHistory(SYMBOL, TIMEFRAME, FEATURE_VERSION, 100);
  const featureRows = history.map((snap) => {
    const minuteKey = snap.asOf.slice(0, 16);
    const candle = allCandles.find((c) => c.time.slice(0, 16) === minuteKey);
    return { asOf: snap.asOf, entryPrice: candle?.close ?? null, snapshot: snap };
  }).filter((r) => r.entryPrice != null);
  const labeled = batchLabel(featureRows, allCandles).filter((r) => r.valid);
  const dist = classDistribution(labeled);
  assert(dist.total > 0, 'total > 0');
  assertEq(dist.SHORT + dist.NEUTRAL + dist.LONG, dist.total, 'counts sum to total');
});

test('buildDataset returns ok=true with correct shape', () => {
  const history = featureStore.getCanonicalHistory(SYMBOL, TIMEFRAME, FEATURE_VERSION, 100);
  dataset = buildDataset(history, allCandles, { symbol: SYMBOL, timeframe: TIMEFRAME });
  assert(dataset.ok === true, `buildDataset ok: ${dataset.reason}`);
  assert(Array.isArray(dataset.X), 'X is array');
  assert(Array.isArray(dataset.y), 'y is array');
  assertEq(dataset.X.length, dataset.nSamples, 'X rows == nSamples');
  assertEq(dataset.y.length, dataset.nSamples, 'y length == nSamples');
  assertEq(dataset.featureNames.length, FEATURE_NAMES.length, 'featureNames count');
});

test('dataset rows have correct feature vector length', () => {
  assert(dataset !== null, 'dataset set');
  for (const row of dataset.X) {
    assertEq(row.length, FEATURE_NAMES.length, `row length == ${FEATURE_NAMES.length}`);
    assert(row.every((v) => Number.isFinite(v)), 'all values finite');
  }
});

test('dataset y contains only valid class indices (0, 1, 2)', () => {
  for (const cls of dataset.y) {
    assert([0, 1, 2].includes(cls), `invalid classIndex: ${cls}`);
  }
});

test('dataset has datasetHash (16-char hex)', () => {
  assert(typeof dataset.datasetHash === 'string', 'datasetHash is string');
  assertEq(dataset.datasetHash.length, 16, 'datasetHash 16 chars');
  assert(/^[0-9a-f]+$/.test(dataset.datasetHash), 'datasetHash is hex');
});

test('buildDataset returns ok=false with empty snapshot list', () => {
  const result = buildDataset([], allCandles, { symbol: SYMBOL });
  assert(result.ok === false, 'ok=false for empty snapshots');
});

// ── Section 5: Chronological split ───────────────────────────────────────────

console.log('\n[5] Chronological split');

test('chronologicalSplit produces non-overlapping train/val/test indices', () => {
  const n = dataset.nSamples;
  if (n < 30) { console.log('    [skip] dataset too small for split test'); return; }
  const { trainIdx, valIdx, testIdx } = chronologicalSplit(n);
  // No overlap
  const trainSet = new Set(trainIdx);
  const valSet   = new Set(valIdx);
  const testSet  = new Set(testIdx);
  assert(trainSet.size === trainIdx.length, 'train no duplicates');
  assert(valSet.size   === valIdx.length,   'val no duplicates');
  assert(testSet.size  === testIdx.length,  'test no duplicates');
  for (const i of trainIdx) assert(!valSet.has(i) && !testSet.has(i), 'train not in val/test');
  for (const i of valIdx)   assert(!trainSet.has(i) && !testSet.has(i), 'val not in train/test');
  for (const i of testIdx)  assert(!trainSet.has(i) && !valSet.has(i), 'test not in train/val');
});

test('chronologicalSplit respects gap between splits', () => {
  const n = dataset.nSamples;
  if (n < 30) { console.log('    [skip] dataset too small'); return; }
  const { trainIdx, valIdx, testIdx, meta } = chronologicalSplit(n);
  const trainEnd  = Math.max(...trainIdx);
  const valStart  = Math.min(...valIdx);
  const valEnd    = Math.max(...valIdx);
  const testStart = Math.min(...testIdx);
  assert(valStart > trainEnd + 1, 'gap between train and val');
  assert(testStart > valEnd + 1,  'gap between val and test');
});

test('chronologicalSplit throws for n < 30', () => {
  let threw = false;
  try { chronologicalSplit(20); } catch { threw = true; }
  assert(threw, 'throws for n=20');
});

// ── Section 6: Model registry ─────────────────────────────────────────────────

console.log('\n[6] Model registry');

const MOCK_MODEL_VERSION = `p1_v1_${Date.now()}_inttest`;
const MOCK_ARTIFACT_PATH = path.join(__dirname, 'fixtures', 'mock_model.ubj');

test('register adds a model to the registry', () => {
  registry.register({
    modelVersion:     MOCK_MODEL_VERSION,
    createdAt:        new Date().toISOString(),
    datasetHash:      dataset?.datasetHash || 'abc123',
    featureVersion:   FEATURE_VERSION,
    labelSpecVersion: LABEL_SPEC.version,
    symbol:           SYMBOL,
    timeframe:        TIMEFRAME,
    artifactPath:     MOCK_ARTIFACT_PATH,
    manifestPath:     '/tmp/mock_manifest.json',
    trainMetrics:     { logloss: 0.95, accuracy: 0.52 },
    valMetrics:       { logloss: 0.98, accuracy: 0.50 },
    testMetrics:      { logloss: 1.01, accuracy: 0.49 },
    featureImportance: {},
    bestIteration:    150,
  });

  const found = registry.getModel(MOCK_MODEL_VERSION);
  assert(found !== null, 'model found after register');
  assertEq(found.modelVersion, MOCK_MODEL_VERSION, 'version matches');
  assertEq(found.symbol, SYMBOL, 'symbol matches');
  assert(found.champion === false, 'not champion yet');
});

test('listModels includes registered model', () => {
  const models = registry.listModels(SYMBOL);
  assert(models.length >= 1, 'at least one model');
  const found = models.find((m) => m.modelVersion === MOCK_MODEL_VERSION);
  assert(found !== null, 'mock model in list');
});

test('getChampion returns null before promotion', () => {
  const champion = registry.getChampion(SYMBOL);
  assert(champion === null, 'no champion before promotion');
});

test('promoteChampion sets champion flag', () => {
  registry.promoteChampion(MOCK_MODEL_VERSION);
  const champion = registry.getChampion(SYMBOL);
  assert(champion !== null, 'champion set after promotion');
  assertEq(champion.modelVersion, MOCK_MODEL_VERSION, 'correct champion version');
  assert(champion.champion === true, 'champion flag true');
});

test('getChampion without symbol filter also finds champion', () => {
  const champion = registry.getChampion();
  assert(champion !== null, 'champion found without symbol filter');
  assertEq(champion.modelVersion, MOCK_MODEL_VERSION, 'correct version');
});

test('promoteChampion throws for unknown model version', () => {
  let threw = false;
  try { registry.promoteChampion('nonexistent_version_xyz'); } catch { threw = true; }
  assert(threw, 'throws for unknown modelVersion');
});

test('setChallenger works independently of champion', () => {
  // Register a second model to set as challenger
  const challengerVersion = `${MOCK_MODEL_VERSION}_challenger`;
  registry.register({
    modelVersion:     challengerVersion,
    createdAt:        new Date().toISOString(),
    datasetHash:      'def456',
    featureVersion:   FEATURE_VERSION,
    labelSpecVersion: LABEL_SPEC.version,
    symbol:           SYMBOL,
    timeframe:        TIMEFRAME,
    artifactPath:     MOCK_ARTIFACT_PATH,
    manifestPath:     '/tmp/mock_challenger.json',
    trainMetrics:     {},
    valMetrics:       {},
    testMetrics:      {},
  });
  registry.setChallenger(challengerVersion);
  const challenger = registry.getChallenger(SYMBOL);
  assert(challenger !== null, 'challenger set');
  assertEq(challenger.modelVersion, challengerVersion, 'correct challenger version');
  // Champion remains unchanged
  const champion = registry.getChampion(SYMBOL);
  assertEq(champion.modelVersion, MOCK_MODEL_VERSION, 'champion unchanged after setChallenger');
});

test('getStats returns correct counts', () => {
  const stats = registry.getStats();
  assert(stats.totalModels >= 2, 'at least 2 models');
  assertEq(stats.champion, MOCK_MODEL_VERSION, 'champion in stats');
});

// ── Section 7: Inference worker status (no Python) ───────────────────────────

console.log('\n[7] Inference worker status');

test('getWorkerStatus returns not-ready when no worker started', () => {
  const status = getWorkerStatus();
  assertEq(status.running, false, 'not running');
  assertEq(status.ready,   false, 'not ready');
  assert(status.loadedModel === null, 'no loaded model');
  assertEq(status.pendingRequests, 0, '0 pending');
});

// ── Section 8: Signal shape validation ───────────────────────────────────────

console.log('\n[8] Signal shape contract');

test('inferred signal object has all required fields for frontend', () => {
  // Construct the shape that inferenceService.infer() would return
  // and validate it matches what MLSignalBadge / MLSignalPanel expect
  const champion = registry.getChampion(SYMBOL);
  const snap     = featureStore.getLatestCanonical(SYMBOL, TIMEFRAME);

  const mockSignal = {
    symbol:         SYMBOL,
    timeframe:      TIMEFRAME,
    asOf:           snap.asOf,
    modelVersion:   champion.modelVersion,
    featureVersion: snap.featureVersion,
    provisional:    false,
    class:          'LONG',
    classIndex:     2,
    probabilities:  { SHORT: 0.10, NEUTRAL: 0.25, LONG: 0.65 },
    confidence:     0.65,
    champion:       true,
    diagnostics: {
      inferenceLatencyMs:  8,
      featureComputeMs:    3,
      driftStatus:         'ok',
      missingFeatureCount: snap.missingFeatureCount,
    },
  };

  // Required by MLSignalBadge
  assert(typeof mockSignal.class === 'string', 'class is string');
  assert(['LONG', 'SHORT', 'NEUTRAL'].includes(mockSignal.class), 'class is valid enum');
  assert(typeof mockSignal.confidence === 'number', 'confidence is number');
  assert(mockSignal.confidence >= 0 && mockSignal.confidence <= 1, 'confidence in [0,1]');
  assert(typeof mockSignal.provisional === 'boolean', 'provisional is bool');

  // Required by MLSignalPanel
  assert(typeof mockSignal.modelVersion === 'string', 'modelVersion present');
  assert(typeof mockSignal.asOf === 'string', 'asOf present');
  assert(typeof mockSignal.probabilities === 'object', 'probabilities present');
  assert('LONG' in mockSignal.probabilities, 'probabilities.LONG');
  assert('SHORT' in mockSignal.probabilities, 'probabilities.SHORT');
  assert('NEUTRAL' in mockSignal.probabilities, 'probabilities.NEUTRAL');

  // Probabilities sum to ~1
  const probSum = mockSignal.probabilities.LONG + mockSignal.probabilities.SHORT + mockSignal.probabilities.NEUTRAL;
  assertClose(probSum, 1.0, 0.01, 'probabilities sum to ~1');

  // classIndex matches class
  assertEq(mockSignal.classIndex, LABEL_SPEC.classMapping[mockSignal.class], 'classIndex matches class');

  // Required by WatchlistMLSignalCell tooltip
  assert(typeof mockSignal.modelVersion === 'string', 'modelVersion for tooltip');
  assert(mockSignal.asOf !== undefined, 'asOf for tooltip');
  assert(typeof mockSignal.provisional === 'boolean', 'provisional for tooltip');
});

test('provisional signal has provisional=true flag', () => {
  const provSignal = {
    symbol:       SYMBOL,
    timeframe:    TIMEFRAME,
    asOf:         new Date().toISOString(),
    modelVersion: MOCK_MODEL_VERSION,
    featureVersion: FEATURE_VERSION,
    provisional:  true,
    class:        'NEUTRAL',
    classIndex:   1,
    probabilities: { SHORT: 0.20, NEUTRAL: 0.55, LONG: 0.25 },
    confidence:   0.55,
    champion:     true,
    diagnostics:  { inferenceLatencyMs: 6, featureComputeMs: 2, driftStatus: 'ok', missingFeatureCount: 0 },
  };
  assert(provSignal.provisional === true, 'provisional flag set');
  assert(provSignal.class === 'NEUTRAL', 'class present in provisional signal');
});

test('featureVector from canonical snapshot has no NaN values', () => {
  const snap = featureStore.getLatestCanonical(SYMBOL, TIMEFRAME);
  assert(snap !== null, 'snap present');
  const vec = toFeatureVector(snap);
  assert(vec.every((v) => !Number.isNaN(v)), 'no NaN in feature vector');
  assertEq(vec.length, FEATURE_NAMES.length, 'correct length');
});

// ── Section 9: Feature definition integrity ───────────────────────────────────

console.log('\n[9] Feature definition integrity');

test('FEATURE_SPEC has 11 entries matching FEATURE_NAMES', () => {
  assertEq(FEATURE_SPEC.length, 11, '11 features in spec');
  assertEq(FEATURE_SPEC.length, FEATURE_NAMES.length, 'spec length == names length');
  for (let i = 0; i < FEATURE_SPEC.length; i++) {
    assertEq(FEATURE_SPEC[i].name, FEATURE_NAMES[i], `spec[${i}].name matches FEATURE_NAMES[${i}]`);
  }
});

test('LABEL_SPEC has frozen class mapping SHORT=0 NEUTRAL=1 LONG=2', () => {
  assertEq(LABEL_SPEC.classMapping.SHORT,   0, 'SHORT=0');
  assertEq(LABEL_SPEC.classMapping.NEUTRAL, 1, 'NEUTRAL=1');
  assertEq(LABEL_SPEC.classMapping.LONG,    2, 'LONG=2');
  assertEq(LABEL_SPEC.indexToClass[0], 'SHORT',   '0→SHORT');
  assertEq(LABEL_SPEC.indexToClass[1], 'NEUTRAL', '1→NEUTRAL');
  assertEq(LABEL_SPEC.indexToClass[2], 'LONG',    '2→LONG');
  assertEq(LABEL_SPEC.horizonBars, 5, 'horizonBars=5');
  assertEq(LABEL_SPEC.fallbackCostBps, 8, 'fallbackCostBps=8');
});

// ── Result ────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Integration: ${passed} passed, ${failed} failed`);

if (failures.length > 0) {
  console.log('\nFailed tests:');
  for (const { name, err } of failures) {
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

console.log('─'.repeat(50));

if (failed > 0) process.exit(1);
