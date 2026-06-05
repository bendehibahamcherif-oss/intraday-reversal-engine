'use strict';

/**
 * yahooHistoricalProvider.js
 * Yahoo Finance historical candle provider.
 *
 * - No API key required.
 * - Uses the public Yahoo Finance v8 chart endpoint.
 * - Returns raw candles; the caller is responsible for normalizing via
 *   canonicalSchema.normalizeCandle / validateAndClean.
 */

// ---------------------------------------------------------------------------
// Timeframe mapping
// ---------------------------------------------------------------------------

/** Canonical timeframe → Yahoo Finance interval string */
const TIMEFRAME_MAP = {
  '1m':  '1m',
  '5m':  '5m',
  '15m': '15m',
  '30m': '30m',
  '1h':  '60m',
  '1d':  '1d',
};

// ---------------------------------------------------------------------------
// Max date-range limits (in days) per timeframe
// ---------------------------------------------------------------------------

const MAX_DAYS = {
  '1m':  7,
  '5m':  60,
  '15m': 60,
  '30m': 60,
  '1h':  730,
  '1d':  Infinity,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

/**
 * Fetch a URL with a timeout using the native fetch API (Node 18+).
 * Returns { ok, status, body } where body is the parsed JSON or null.
 *
 * @param {string}       url
 * @param {AbortSignal}  signal
 * @returns {Promise<{ ok: boolean, status: number, body: any, rawError?: Error }>}
 */
async function fetchJSON(url, signal) {
  let response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal,
    });
  } catch (err) {
    return { ok: false, status: 0, body: null, rawError: err };
  }

  let body = null;
  try {
    body = await response.json();
  } catch (_err) {
    // Non-JSON body — leave as null
  }

  return { ok: response.ok, status: response.status, body };
}

// ---------------------------------------------------------------------------
// Main provider function
// ---------------------------------------------------------------------------

/**
 * fetchHistoricalCandles — fetches OHLCV candles from Yahoo Finance.
 *
 * Raw candle shape returned (short-form keys):
 *   { t: epochMs, o, h, l, c, v }
 *
 * @param {Object}  opts
 * @param {string}  opts.symbol
 * @param {string}  opts.timeframe  canonical ('1m' | '5m' | '15m' | '30m' | '1h' | '1d')
 * @param {string}  opts.startDate  'YYYY-MM-DD'
 * @param {string}  opts.endDate    'YYYY-MM-DD'
 * @param {string}  [opts.session]  passed through; Yahoo does not filter sessions
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   candles?: Object[],
 *   provider: 'yahoo',
 *   warnings?: string[],
 *   error?: { code: string, message: string }
 * }>}
 */
async function fetchHistoricalCandles({ symbol, timeframe, startDate, endDate }) {
  const warnings = [];

  // --- Validate timeframe ---
  const interval = TIMEFRAME_MAP[timeframe];
  if (!interval) {
    return {
      ok:       false,
      provider: 'yahoo',
      error:    {
        code:    'INVALID_TIMEFRAME',
        message: `Timeframe "${timeframe}" is not supported by the Yahoo Finance provider. ` +
                 `Supported: ${Object.keys(TIMEFRAME_MAP).join(', ')}.`,
      },
    };
  }

  // --- Validate and parse dates ---
  const startMs = Date.parse(startDate);
  const endMs   = Date.parse(endDate);

  if (isNaN(startMs) || isNaN(endMs)) {
    return {
      ok:       false,
      provider: 'yahoo',
      error:    { code: 'INVALID_DATE', message: 'startDate or endDate is not a valid date.' },
    };
  }

  if (endMs < startMs) {
    return {
      ok:       false,
      provider: 'yahoo',
      error:    { code: 'INVALID_DATE_RANGE', message: 'endDate must be >= startDate.' },
    };
  }

  // --- Enforce max date-range limit ---
  const maxDays = MAX_DAYS[timeframe];
  if (isFinite(maxDays)) {
    const rangeMs   = endMs - startMs;
    const rangeDays = Math.ceil(rangeMs / MS_PER_DAY);
    if (rangeDays > maxDays) {
      return {
        ok:       false,
        provider: 'yahoo',
        error:    {
          code:    'DATE_RANGE_TOO_LARGE',
          message: `Yahoo Finance limits "${timeframe}" data to ${maxDays} day(s). ` +
                   `Requested range spans ${rangeDays} day(s). ` +
                   `Please narrow your date range.`,
        },
      };
    }
  }

  // --- Build URL ---
  const period1  = Math.floor(startMs / 1000);
  const period2  = Math.floor(endMs   / 1000);
  const url      = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
                   `?interval=${interval}&period1=${period1}&period2=${period2}`;

  // --- Fetch with timeout ---
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 15_000);

  let fetchResult;
  try {
    fetchResult = await fetchJSON(url, controller.signal);
  } finally {
    clearTimeout(timer);
  }

  // --- Network / timeout errors ---
  if (fetchResult.rawError) {
    const isTimeout = fetchResult.rawError.name === 'AbortError';
    return {
      ok:       false,
      provider: 'yahoo',
      error:    {
        code:    isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        message: isTimeout
          ? `Yahoo Finance request timed out after 15 seconds (${symbol}).`
          : fetchResult.rawError.message,
      },
    };
  }

  // --- Non-200 HTTP status ---
  if (!fetchResult.ok) {
    return {
      ok:       false,
      provider: 'yahoo',
      error:    {
        code:    'HTTP_ERROR',
        message: `Yahoo Finance returned HTTP ${fetchResult.status} for symbol "${symbol}".`,
      },
    };
  }

  // --- Yahoo-level error in response body ---
  const chartError = fetchResult.body?.chart?.error;
  if (chartError) {
    return {
      ok:       false,
      provider: 'yahoo',
      error:    {
        code:    'PROVIDER_ERROR',
        message: chartError.description || chartError.code || JSON.stringify(chartError),
      },
    };
  }

  // --- Parse result ---
  const result = fetchResult.body?.chart?.result?.[0];
  if (!result) {
    return {
      ok:       false,
      provider: 'yahoo',
      error:    {
        code:    'EMPTY_RESPONSE',
        message: `Yahoo Finance returned no chart data for symbol "${symbol}".`,
      },
    };
  }

  const timestamps = result.timestamp || [];
  const quote      = result.indicators?.quote?.[0] || {};
  const opens      = quote.open   || [];
  const highs      = quote.high   || [];
  const lows       = quote.low    || [];
  const closes     = quote.close  || [];
  const volumes    = quote.volume || [];

  if (timestamps.length === 0) {
    warnings.push(`Yahoo Finance returned 0 candles for "${symbol}" in the requested range.`);
    return { ok: true, candles: [], provider: 'yahoo', warnings };
  }

  // Build raw candle objects.
  // timestamp: epoch seconds from Yahoo → multiply to ms so normalizeCandle
  // treats it correctly (the coerceTimestamp heuristic handles both).
  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    candles.push({
      t: timestamps[i] * 1000, // epoch ms
      o: opens[i],
      h: highs[i],
      l: lows[i],
      c: closes[i],
      v: volumes[i] != null ? volumes[i] : 0,
    });
  }

  return { ok: true, candles, provider: 'yahoo', warnings };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  fetchHistoricalCandles,
  TIMEFRAME_MAP,
  MAX_DAYS,
};
