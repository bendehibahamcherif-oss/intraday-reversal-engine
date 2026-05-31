'use strict';

/**
 * P1 Feature Service — computes the 11 P1 features as-of t.
 *
 * Canonical snapshots: provisional=false, computed on closed 1m bars.
 * Preview snapshots:   provisional=true,  computed on tick/CVD/VP updates.
 *
 * All computations are strictly as-of t: no source data after asOf is used.
 * Any violation causes a LeakageError to be thrown.
 */

const { FEATURE_VERSION, FEATURE_NAMES, LABEL_SPEC } = require('./featureDefinitions');
const {
  LeakageError,
  assertSourceTimestamps,
  assertCandlesOrdering,
  validateFeatureSnapshot,
} = require('./featureLeakageGuards');

// ── Math helpers ──────────────────────────────────────────────────────────────

function logReturn(a, b) {
  if (!a || !b || a <= 0 || b <= 0) return 0;
  return Math.log(b / a);
}

/**
 * Exponential Moving Average — computes EMA for a closes array up to and including index t.
 * Uses standard EMA formula: alpha = 2/(period+1).
 */
function ema(closes, period) {
  if (closes.length < period) return null;
  const alpha = 2 / (period + 1);
  let val = closes[0];
  for (let i = 1; i < closes.length; i++) {
    val = alpha * closes[i] + (1 - alpha) * val;
  }
  return val;
}

/**
 * RSI14 on closes array (strictly up to and including index t).
 */
function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const slice = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const diff = slice[i] - slice[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// ── Feature computation ───────────────────────────────────────────────────────

/**
 * Compute all 11 P1 features from data sources.
 *
 * @param {object} opts
 * @param {string}  opts.symbol
 * @param {string}  opts.timeframe      e.g. '1m'
 * @param {Date|string} opts.asOf       timestamp of the closed bar
 * @param {boolean} opts.provisional    true = live preview (not canonical)
 *
 * Data sources (all must be as-of asOf):
 * @param {Array<{time, open, high, low, close, volume}>} opts.candles  chronological, closed bars
 * @param {number}  opts.vwap            VWAP as of asOf
 * @param {string}  opts.vwapTimestamp   ISO timestamp of VWAP snapshot
 * @param {number}  opts.poc             Point of Control from volume profile
 * @param {string}  opts.volumeProfileTimestamp
 * @param {Array<{time, value}>} opts.cvdHistory  CVD snapshots chronological
 * @param {Array<{time, upImbalances, downImbalances}>} opts.footprintBars  most recent footprint bars
 *
 * @returns {object} feature snapshot
 */
function computeFeatures(opts) {
  const {
    symbol, timeframe, asOf, provisional = false,
    candles = [], vwap, vwapTimestamp,
    poc, volumeProfileTimestamp,
    cvdHistory = [], footprintBars = [],
  } = opts;

  if (!symbol) throw new Error('symbol is required');
  if (!asOf)   throw new Error('asOf is required');

  const asOfMs = new Date(asOf).getTime();

  // ── Filter sources strictly as-of t ───────────────────────────────────────

  const filteredCandles = candles.filter((c) => {
    const closeMs = new Date(c.time).getTime() + 60_000; // open time + 1m = close time
    return closeMs <= asOfMs + 1000;
  });

  assertCandlesOrdering(filteredCandles, asOf);

  const filteredCvd = cvdHistory.filter((c) => new Date(c.time).getTime() <= asOfMs + 1000);
  const filteredFootprint = footprintBars.filter((b) => new Date(b.time).getTime() <= asOfMs + 1000);

  // Source timestamps for leakage audit
  const sourceTimestamps = {
    candles:        filteredCandles.length ? filteredCandles[filteredCandles.length - 1].time : null,
    vwap:           vwapTimestamp || null,
    volumeProfile:  volumeProfileTimestamp || null,
    cvd:            filteredCvd.length ? filteredCvd[filteredCvd.length - 1].time : null,
    footprint:      filteredFootprint.length ? filteredFootprint[filteredFootprint.length - 1].time : null,
  };

  assertSourceTimestamps(sourceTimestamps, asOf);

  const closes  = filteredCandles.map((c) => c.close);
  const volumes = filteredCandles.map((c) => c.volume || 0);
  const n       = closes.length;

  const features = {};
  let missingCount = 0;

  const safe = (name, fn) => {
    try {
      const v = fn();
      features[name] = (v == null || !Number.isFinite(v)) ? null : Number(v.toFixed(8));
      if (features[name] == null) missingCount++;
    } catch {
      features[name] = null;
      missingCount++;
    }
  };

  // ── 1. ret_1m ────────────────────────────────────────────────────────────
  safe('ret_1m', () => n >= 2 ? logReturn(closes[n - 2], closes[n - 1]) : null);

  // ── 2. ret_5m ────────────────────────────────────────────────────────────
  safe('ret_5m', () => n >= 6 ? logReturn(closes[n - 6], closes[n - 1]) : null);

  // ── 3. ret_15m ───────────────────────────────────────────────────────────
  safe('ret_15m', () => n >= 16 ? logReturn(closes[n - 16], closes[n - 1]) : null);

  // ── 4. vwap_gap ──────────────────────────────────────────────────────────
  safe('vwap_gap', () => {
    if (!vwap || !n) return null;
    const close = closes[n - 1];
    return (close - vwap) / vwap;
  });

  // ── 5. rsi14 ─────────────────────────────────────────────────────────────
  safe('rsi14', () => rsi(closes, 14));

  // ── 6. ema_spread_9_20 ───────────────────────────────────────────────────
  safe('ema_spread_9_20', () => {
    if (n < 20) return null;
    const e9  = ema(closes, 9);
    const e20 = ema(closes, 20);
    if (e9 == null || e20 == null) return null;
    return (e9 - e20) / closes[n - 1];
  });

  // ── 7. ema_cross_event ───────────────────────────────────────────────────
  safe('ema_cross_event', () => {
    if (n < 21) return 0;
    const ema9Prev  = ema(closes.slice(0, n - 1), 9);
    const ema20Prev = ema(closes.slice(0, n - 1), 20);
    const ema9Curr  = ema(closes, 9);
    const ema20Curr = ema(closes, 20);
    if (ema9Prev == null || ema20Prev == null || ema9Curr == null || ema20Curr == null) return 0;
    const wasBelowNow = ema9Prev < ema20Prev && ema9Curr >= ema20Curr; // bullish
    const wasAboveNow = ema9Prev > ema20Prev && ema9Curr <= ema20Curr; // bearish
    return wasBelowNow ? 1 : wasAboveNow ? -1 : 0;
  });

  // ── 8. vol_spike_20 ──────────────────────────────────────────────────────
  safe('vol_spike_20', () => {
    if (n < 21) return null;
    const currentVol = volumes[n - 1];
    const prevVols   = volumes.slice(n - 21, n - 1); // 20 bars strictly before t
    const avgVol     = mean(prevVols);
    return avgVol > 0 ? currentVol / avgVol : null;
  });

  // ── 9. poc_distance ──────────────────────────────────────────────────────
  safe('poc_distance', () => {
    if (poc == null || !n) return null;
    const close = closes[n - 1];
    return close > 0 ? (close - poc) / close : null;
  });

  // ── 10. cvd_delta_5 ──────────────────────────────────────────────────────
  safe('cvd_delta_5', () => {
    if (filteredCvd.length < 6) return null;
    const nc = filteredCvd.length;
    const cvdNow  = filteredCvd[nc - 1].value;
    const cvd5ago = filteredCvd[nc - 6].value;
    // sum of volumes in last 5 bars
    const volSlice = volumes.slice(Math.max(0, n - 5));
    const volSum   = Math.max(volSlice.reduce((s, v) => s + v, 0), 1);
    return (cvdNow - cvd5ago) / volSum;
  });

  // ── 11. footprint_imbalance_recent ───────────────────────────────────────
  safe('footprint_imbalance_recent', () => {
    if (filteredFootprint.length < 3) return null;
    const recent = filteredFootprint.slice(-3);
    let upTotal = 0, downTotal = 0;
    for (const bar of recent) {
      upTotal   += Number(bar.upImbalances   || bar.upImbalanceCount   || 0);
      downTotal += Number(bar.downImbalances || bar.downImbalanceCount || 0);
    }
    return (upTotal - downTotal) / 3;
  });

  // Ensure all feature names present (null for missing)
  for (const name of FEATURE_NAMES) {
    if (!(name in features)) features[name] = null;
  }

  const snapshot = {
    symbol,
    timeframe,
    asOf:            new Date(asOf).toISOString(),
    featureVersion:  FEATURE_VERSION,
    provisional,
    features,
    sourceTimestamps,
    missingFeatureCount: missingCount,
    computedAt:      new Date().toISOString(),
  };

  validateFeatureSnapshot(snapshot);
  return snapshot;
}

/**
 * Compute feature vector as ordered array (for ML input).
 * Returns null for any missing feature — caller must handle.
 */
function toFeatureVector(snapshot) {
  return FEATURE_NAMES.map((name) => snapshot.features[name] ?? 0);
}

module.exports = { computeFeatures, toFeatureVector, FEATURE_NAMES, LeakageError };
