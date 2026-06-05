'use strict';

/**
 * canonicalSchema.js
 * Canonical HistoricalCandle schema, supported constants, and
 * normalization / validation / serialization helpers.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPPORTED_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '1d'];
const SUPPORTED_SESSIONS   = ['RTH', 'EXTENDED', 'ALL'];
const SUPPORTED_PURPOSES   = ['ml', 'backtest', 'correlation', 'general'];

const CSV_HEADER = 'timestamp,symbol,timeframe,open,high,low,close,volume,provider,session,sourceType,adjusted';

// ---------------------------------------------------------------------------
// RTH session filter
// ---------------------------------------------------------------------------
// Regular Trading Hours: 09:30–16:00 Eastern Time.
// ET is UTC-5 (EST) or UTC-4 (EDT).
//
// DST rule (US): second Sunday of March → first Sunday of November.

/**
 * Returns true if the Date object falls within US Eastern Daylight Time (EDT).
 * Uses the standard US DST schedule: 2nd Sunday of March – 1st Sunday of November.
 * @param {Date} d
 * @returns {boolean}
 */
function isEDT(d) {
  const year  = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-based

  // Outside March–November: definitely not EDT
  if (month < 2 || month > 10) return false;
  if (month > 2 && month < 10) return true; // April–October always EDT

  // March: DST starts on 2nd Sunday at 2:00 AM local (≈ 07:00 UTC)
  if (month === 2) {
    const dstStart = nthSundayOfMonth(year, 2, 2);
    return d >= dstStart;
  }

  // November: DST ends on 1st Sunday at 2:00 AM local (≈ 07:00 UTC)
  const dstEnd = nthSundayOfMonth(year, 10, 1);
  return d < dstEnd;
}

/**
 * Returns a Date for the nth occurrence of Sunday in the given UTC month.
 * The returned Date is set to 07:00 UTC (≈ 2:00 AM ET clock transition).
 * @param {number} year
 * @param {number} month  0-based UTC month
 * @param {number} n      1-based occurrence index
 * @returns {Date}
 */
function nthSundayOfMonth(year, month, n) {
  const first = new Date(Date.UTC(year, month, 1));
  const firstSundayOffset = (7 - first.getUTCDay()) % 7;
  const day = 1 + firstSundayOffset + (n - 1) * 7;
  return new Date(Date.UTC(year, month, day, 7, 0, 0));
}

/**
 * Returns the time-of-day as a decimal hour in Eastern Time
 * (e.g. 9.5 = 09:30, 16.0 = 16:00).
 * @param {Date} d
 * @returns {number}
 */
function etDecimalHour(d) {
  const offsetHours = isEDT(d) ? -4 : -5;
  const etMs = d.getTime() + offsetHours * 3600 * 1000;
  const etDate = new Date(etMs);
  return etDate.getUTCHours() + etDate.getUTCMinutes() / 60;
}

/**
 * sessionFilter — decides whether a candle's timestamp belongs to the
 * requested session.
 *
 * RTH  : 09:30 ≤ ET < 16:00
 * EXTENDED: pre-market (04:00–09:30) + after-hours (16:00–20:00) ET
 * ALL  : always true
 *
 * @param {string} isoTimestamp  ISO 8601 UTC string
 * @param {string} session       'RTH' | 'EXTENDED' | 'ALL'
 * @returns {boolean}
 */
function sessionFilter(isoTimestamp, session) {
  if (session === 'ALL') return true;

  const d = new Date(isoTimestamp);
  if (isNaN(d.getTime())) return false;

  const etHour = etDecimalHour(d);

  if (session === 'RTH') {
    // 09:30 ≤ time < 16:00 ET
    return etHour >= 9.5 && etHour < 16.0;
  }

  if (session === 'EXTENDED') {
    // Pre-market 04:00–09:30 and after-hours 16:00–20:00 ET
    return (etHour >= 4.0 && etHour < 9.5) || (etHour >= 16.0 && etHour < 20.0);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/**
 * Coerce a raw timestamp (epoch ms, epoch s, or ISO string) to an ISO 8601
 * UTC string.  Returns null if not parseable.
 * @param {*} raw
 * @returns {string|null}
 */
function coerceTimestamp(raw) {
  if (raw == null) return null;

  if (typeof raw === 'number') {
    // Heuristic: values > 9_999_999_999 are already ms, otherwise treat as s.
    const ts = raw > 9_999_999_999 ? raw : raw * 1000;
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  if (typeof raw === 'string') {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  return null;
}

/**
 * Parse a numeric field; returns the finite number or null.
 * @param {*} val
 * @returns {number|null}
 */
function toFinite(val) {
  const n = Number(val);
  return isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// normalizeCandle
// ---------------------------------------------------------------------------

/**
 * normalizeCandle — converts a raw provider candle into a HistoricalCandle.
 *
 * Raw input may use long-form or short-form keys:
 *   timestamp | t,  open | o,  high | h,  low | l,  close | c,  volume | v
 *
 * Validation rules:
 *  - timestamp must be parseable
 *  - open, high, low, close must all be finite and > 0
 *  - volume must be finite and >= 0
 *
 * @param {Object} raw
 * @param {{ provider: string, symbol: string, timeframe: string }} meta
 * @returns {HistoricalCandle|null}  null when data is invalid / incomplete
 */
function normalizeCandle(raw, { provider, symbol, timeframe }) {
  if (!raw || typeof raw !== 'object') return null;

  // Timestamp
  const rawTs   = raw.timestamp !== undefined ? raw.timestamp : raw.t;
  const timestamp = coerceTimestamp(rawTs);
  if (!timestamp) return null;

  // OHLC — long-form keys take priority over short-form
  const open  = toFinite(raw.open  !== undefined ? raw.open  : raw.o);
  const high  = toFinite(raw.high  !== undefined ? raw.high  : raw.h);
  const low   = toFinite(raw.low   !== undefined ? raw.low   : raw.l);
  const close = toFinite(raw.close !== undefined ? raw.close : raw.c);

  if (open  === null || open  <= 0) return null;
  if (high  === null || high  <= 0) return null;
  if (low   === null || low   <= 0) return null;
  if (close === null || close <= 0) return null;

  // Volume
  const volume = toFinite(raw.volume !== undefined ? raw.volume : raw.v);
  if (volume === null || volume < 0) return null;

  return {
    timestamp,
    symbol:     String(symbol).toUpperCase(),
    timeframe:  String(timeframe),
    open,
    high,
    low,
    close,
    volume,
    provider:   String(provider),
    session:    'ALL',
    sourceType: 'historical',
    adjusted:   false,
  };
}

// ---------------------------------------------------------------------------
// validateAndClean
// ---------------------------------------------------------------------------

/**
 * validateAndClean — normalizes, session-filters, deduplicates, and sorts a
 * batch of raw candles.
 *
 * @param {Array}  rawCandles
 * @param {Object} opts
 * @param {string} [opts.session='ALL']   'RTH' | 'EXTENDED' | 'ALL'
 * @param {string} opts.provider
 * @param {string} opts.symbol
 * @param {string} opts.timeframe
 * @returns {{ candles: HistoricalCandle[], dropped: number, warnings: string[] }}
 */
function validateAndClean(rawCandles, { session = 'ALL', provider, symbol, timeframe }) {
  if (!Array.isArray(rawCandles)) {
    return { candles: [], dropped: 0, warnings: ['Input was not an array; nothing to process.'] };
  }

  const warnings = [];
  let dropped = 0;

  // 1. Normalize each raw candle
  const normalized = [];
  for (const raw of rawCandles) {
    const candle = normalizeCandle(raw, { provider, symbol, timeframe });
    if (candle === null) {
      dropped++;
    } else {
      normalized.push(candle);
    }
  }

  if (dropped > 0) {
    warnings.push(`Dropped ${dropped} candle(s) due to invalid/incomplete OHLCV data.`);
  }

  // 2. Session filter
  let filtered = normalized;
  if (session !== 'ALL') {
    const before = filtered.length;
    filtered = filtered.filter(c => sessionFilter(c.timestamp, session));
    const sessionDropped = before - filtered.length;
    dropped += sessionDropped;
    if (sessionDropped > 0) {
      warnings.push(`Filtered out ${sessionDropped} candle(s) outside ${session} session hours.`);
    }
    for (const c of filtered) {
      c.session = session;
    }
  }

  // 3. Sort by timestamp ascending
  filtered.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

  // 4. Deduplicate by timestamp (keep first occurrence)
  const seen   = new Set();
  const deduped = [];
  for (const c of filtered) {
    if (seen.has(c.timestamp)) {
      dropped++;
    } else {
      seen.add(c.timestamp);
      deduped.push(c);
    }
  }

  const totalDropped = rawCandles.length - deduped.length;

  return { candles: deduped, dropped: totalDropped, warnings };
}

// ---------------------------------------------------------------------------
// CSV serialization
// ---------------------------------------------------------------------------

/**
 * toCsvRow — serializes a HistoricalCandle to a CSV row string.
 * Field order matches CSV_HEADER.
 * @param {HistoricalCandle} candle
 * @returns {string}
 */
function toCsvRow(candle) {
  return [
    candle.timestamp,
    candle.symbol,
    candle.timeframe,
    candle.open,
    candle.high,
    candle.low,
    candle.close,
    candle.volume,
    candle.provider,
    candle.session,
    candle.sourceType,
    candle.adjusted,
  ].join(',');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  SUPPORTED_TIMEFRAMES,
  SUPPORTED_SESSIONS,
  SUPPORTED_PURPOSES,
  CSV_HEADER,
  sessionFilter,
  normalizeCandle,
  validateAndClean,
  toCsvRow,
};
