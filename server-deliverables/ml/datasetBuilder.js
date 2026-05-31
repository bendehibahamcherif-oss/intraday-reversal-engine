'use strict';

/**
 * Dataset builder — joins canonical feature snapshots with outcome labels.
 *
 * Output format (for Python training script):
 * {
 *   X:            number[][],   // rows × features (ordered by FEATURE_NAMES)
 *   y:            number[],     // class indices (SHORT=0, NEUTRAL=1, LONG=2)
 *   featureNames: string[],
 *   asOf:         string[],     // ISO timestamps per row
 *   datasetHash:  string,       // SHA256 of X||y for reproducibility
 *   classMapping: object,
 *   labelSpecVersion: string,
 *   featureVersion:   string,
 *   symbol:       string,
 *   timeframe:    string,
 *   builtAt:      string,
 *   nSamples:     number,
 *   classDistribution: object,
 * }
 */

const crypto = require('crypto');
const { FEATURE_NAMES, FEATURE_VERSION, LABEL_SPEC } = require('./featureDefinitions');

/**
 * Build a labeled dataset from feature snapshots and candle history.
 *
 * @param {Array} canonicalSnapshots   sorted chronologically
 * @param {Array<{time,close,volume}>} allCandles  full candle history
 * @param {object} opts
 * @param {number} [opts.estimatedRoundtripCostBps]
 * @param {string} [opts.symbol]
 * @param {string} [opts.timeframe]
 */
function buildDataset(canonicalSnapshots, allCandles, opts = {}) {
  const { estimatedRoundtripCostBps = null, symbol = '', timeframe = '1m' } = opts;

  const { batchLabel, classDistribution } = require('./outcomeLabeler');

  // Build feature rows for labeling
  const featureRows = canonicalSnapshots.map((snap) => ({
    asOf:       snap.asOf,
    entryPrice: snap.features?.ret_1m != null
      ? null // entryPrice derived from candles
      : null,
    snapshot:   snap,
  }));

  // Enrich with entry prices from candle history
  const candleByTime = new Map();
  for (const c of allCandles) {
    candleByTime.set(new Date(c.time).toISOString().slice(0, 16), c); // minute precision
  }

  const enriched = canonicalSnapshots.map((snap) => {
    const minuteKey = snap.asOf.slice(0, 16);
    const candle    = candleByTime.get(minuteKey);
    return {
      asOf:       snap.asOf,
      entryPrice: candle?.close ?? null,
      snapshot:   snap,
    };
  }).filter((row) => row.entryPrice != null);

  const labeled = batchLabel(enriched, allCandles, estimatedRoundtripCostBps);
  const valid   = labeled.filter((r) => r.valid);

  if (valid.length === 0) {
    return { ok: false, reason: 'No valid labeled rows after join', nSamples: 0 };
  }

  const X = valid.map((row) => FEATURE_NAMES.map((name) => row.snapshot.features[name] ?? 0));
  const y = valid.map((row) => row.classIndex);
  const asOfArr = valid.map((row) => row.asOf);

  const datasetHash = _hashDataset(X, y);
  const dist        = classDistribution(valid);

  return {
    ok:              true,
    X,
    y,
    featureNames:    FEATURE_NAMES,
    asOf:            asOfArr,
    datasetHash,
    classMapping:    LABEL_SPEC.classMapping,
    labelSpecVersion: LABEL_SPEC.version,
    featureVersion:  FEATURE_VERSION,
    symbol,
    timeframe,
    builtAt:         new Date().toISOString(),
    nSamples:        valid.length,
    nDiscarded:      labeled.length - valid.length,
    classDistribution: dist,
  };
}

function _hashDataset(X, y) {
  const flat = X.map((row) => row.join(',')).join(';') + '|' + y.join(',');
  return crypto.createHash('sha256').update(flat).digest('hex').slice(0, 16);
}

/**
 * Serialize dataset to JSON string for passing to Python subprocess.
 */
function serializeDataset(dataset) {
  return JSON.stringify(dataset);
}

module.exports = { buildDataset, serializeDataset };
