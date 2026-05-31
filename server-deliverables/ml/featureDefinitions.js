'use strict';

/**
 * P1 feature set specification — version p1_v1.
 *
 * Each feature entry:
 *   name:        unique identifier used in snapshots + dataset
 *   description: human-readable formula / derivation
 *   sources:     data sources required (candles|vwap|cvd|volumeProfile|footprint)
 *   asOfStrict:  if true, calculation must reject any source data with timestamp > asOf
 */

const FEATURE_VERSION = 'p1_v1';

const FEATURE_SPEC = [
  {
    name: 'ret_1m',
    description: 'ln(close_t / close_{t-1})',
    sources: ['candles'],
    asOfStrict: true,
    minBarsRequired: 2,
  },
  {
    name: 'ret_5m',
    description: 'ln(close_t / close_{t-5})',
    sources: ['candles'],
    asOfStrict: true,
    minBarsRequired: 6,
  },
  {
    name: 'ret_15m',
    description: 'ln(close_t / close_{t-15})',
    sources: ['candles'],
    asOfStrict: true,
    minBarsRequired: 16,
  },
  {
    name: 'vwap_gap',
    description: '(close_t - vwap_t) / vwap_t',
    sources: ['candles', 'vwap'],
    asOfStrict: true,
    minBarsRequired: 1,
  },
  {
    name: 'rsi14',
    description: 'RSI14 on closes <= t',
    sources: ['candles'],
    asOfStrict: true,
    minBarsRequired: 15,
  },
  {
    name: 'ema_spread_9_20',
    description: '(ema9_t - ema20_t) / close_t',
    sources: ['candles'],
    asOfStrict: true,
    minBarsRequired: 20,
  },
  {
    name: 'ema_cross_event',
    description: '+1 bullish cross, -1 bearish cross, 0 none (t-1 to t)',
    sources: ['candles'],
    asOfStrict: true,
    minBarsRequired: 21,
  },
  {
    name: 'vol_spike_20',
    description: 'volume_t / mean(volume_{t-20..t-1})',
    sources: ['candles'],
    asOfStrict: true,
    minBarsRequired: 21,
  },
  {
    name: 'poc_distance',
    description: '(close_t - poc_t) / close_t — volume profile snapshot asOf <= t',
    sources: ['candles', 'volumeProfile'],
    asOfStrict: true,
    minBarsRequired: 1,
  },
  {
    name: 'cvd_delta_5',
    description: '(cvd_t - cvd_{t-5}) / max(sum(volume_{t-4..t}), 1)',
    sources: ['candles', 'cvd'],
    asOfStrict: true,
    minBarsRequired: 6,
  },
  {
    name: 'footprint_imbalance_recent',
    description: '(up_imbalance_{t-2..t} - down_imbalance_{t-2..t}) / 3',
    sources: ['footprint'],
    asOfStrict: true,
    minBarsRequired: 3,
  },
];

// Ordered list of feature names — position in this array = column index in dataset
const FEATURE_NAMES = FEATURE_SPEC.map((f) => f.name);

// Maximum lookback required across all features (for data window requests)
const MAX_LOOKBACK = Math.max(...FEATURE_SPEC.map((f) => f.minBarsRequired));

// Label spec for the tradable 3-class labels
const LABEL_SPEC = {
  version:         'tradable_v1',
  horizonBars:     5,                  // forward closes used for label
  classes:         ['SHORT', 'NEUTRAL', 'LONG'],
  classMapping:    { SHORT: 0, NEUTRAL: 1, LONG: 2 },
  indexToClass:    { 0: 'SHORT', 1: 'NEUTRAL', 2: 'LONG' },
  fallbackCostBps: 8,                  // roundtrip cost fallback if no fill data
};

module.exports = { FEATURE_VERSION, FEATURE_SPEC, FEATURE_NAMES, MAX_LOOKBACK, LABEL_SPEC };
