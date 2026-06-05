'use strict';

/**
 * twelveDataHistoricalProvider.js
 * Twelve Data historical candle provider.
 *
 * - Requires a Twelve Data API key.
 * - Uses the /time_series endpoint with ascending order.
 * - Returns raw candles; the caller normalizes via canonicalSchema.
 */

// ---------------------------------------------------------------------------
// Timeframe mapping
// ---------------------------------------------------------------------------

/** Canonical timeframe → Twelve Data interval string */
const TIMEFRAME_MAP = {
  '1m':  '1min',
  '5m':  '5min',
  '15m': '15min',
  '30m': '30min',
  '1h':  '1h',
  '1d':  '1day',
};

const TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

/**
 * Fetch URL with an AbortSignal, returning parsed JSON.
 * @param {string}      url
 * @param {AbortSignal} signal
 * @returns {Promise<{ ok: boolean, status: number, body: any, rawError?: Error }>}
 */
async function fetchJSON(url, signal) {
  let response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': 'HistoricalDataDownloader/1.0' },
      signal,
    });
  } catch (err) {
    return { ok: false, status: 0, body: null, rawError: err };
  }

  let body = null;
  try {
    body = await response.json();
  } catch (_err) {
    // ignore
  }
  return { ok: response.ok, status: response.status, body };
}

// ---------------------------------------------------------------------------
// Main provider function
// ---------------------------------------------------------------------------

/**
 * fetchHistoricalCandles — fetches OHLCV candles from Twelve Data.
 *
 * Raw candle shape:
 *   { timestamp: isoString, open, high, low, close, volume }
 *
 * @param {Object}  opts
 * @param {string}  opts.symbol
 * @param {string}  opts.timeframe  canonical timeframe
 * @param {string}  opts.startDate  'YYYY-MM-DD'
 * @param {string}  opts.endDate    'YYYY-MM-DD'
 * @param {string}  [opts.apiKey]   Twelve Data API key
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   candles?: Object[],
 *   provider: 'twelvedata',
 *   warnings?: string[],
 *   error?: { code: string, message: string }
 * }>}
 */
async function fetchHistoricalCandles({ symbol, timeframe, startDate, endDate, apiKey }) {
  const warnings = [];

  // --- API key guard ---
  if (!apiKey || !String(apiKey).trim()) {
    return {
      ok:       false,
      provider: 'twelvedata',
      error:    {
        code:    'MISSING_API_KEY',
        message: 'Twelve Data requires an API key. Set TWELVEDATA_API_KEY in your environment.',
      },
    };
  }

  // --- Timeframe validation ---
  const tdInterval = TIMEFRAME_MAP[timeframe];
  if (!tdInterval) {
    return {
      ok:       false,
      provider: 'twelvedata',
      error:    {
        code:    'INVALID_TIMEFRAME',
        message: `Timeframe "${timeframe}" is not supported by the Twelve Data provider. ` +
                 `Supported: ${Object.keys(TIMEFRAME_MAP).join(', ')}.`,
      },
    };
  }

  // --- Build URL ---
  const url =
    `https://api.twelvedata.com/time_series` +
    `?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${tdInterval}` +
    `&start_date=${startDate}` +
    `&end_date=${endDate}` +
    `&outputsize=5000` +
    `&apikey=${encodeURIComponent(apiKey)}` +
    `&format=JSON` +
    `&order=ASC`;

  // --- Fetch with timeout ---
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let result;
  try {
    result = await fetchJSON(url, controller.signal);
  } finally {
    clearTimeout(timer);
  }

  // --- Network / timeout errors ---
  if (result.rawError) {
    const isTimeout = result.rawError.name === 'AbortError';
    return {
      ok:       false,
      provider: 'twelvedata',
      error:    {
        code:    isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        message: isTimeout
          ? 'Twelve Data request timed out after 20 seconds.'
          : result.rawError.message,
      },
    };
  }

  // --- HTTP 429 (rate limit) ---
  if (result.status === 429) {
    return {
      ok:       false,
      provider: 'twelvedata',
      error:    {
        code:    'RATE_LIMIT',
        message: 'Twelve Data rate limit reached (HTTP 429). Please wait before retrying.',
      },
    };
  }

  // --- Other non-OK HTTP responses ---
  if (!result.ok) {
    return {
      ok:       false,
      provider: 'twelvedata',
      error:    {
        code:    'HTTP_ERROR',
        message: `Twelve Data returned HTTP ${result.status} for symbol "${symbol}".`,
      },
    };
  }

  const body = result.body;

  // --- Body-level error responses ---
  if (!body) {
    return {
      ok:       false,
      provider: 'twelvedata',
      error:    { code: 'EMPTY_RESPONSE', message: 'Twelve Data returned an empty response.' },
    };
  }

  if (body.status === 'error') {
    const msg = body.message || body.msg || JSON.stringify(body);
    // Twelve Data encodes rate limit errors as status=error with code 429
    if (body.code === 429 || body.code === '429') {
      return {
        ok:       false,
        provider: 'twelvedata',
        error:    { code: 'RATE_LIMIT', message: `Twelve Data rate limit: ${msg}` },
      };
    }
    return {
      ok:       false,
      provider: 'twelvedata',
      error:    { code: 'PROVIDER_ERROR', message: msg },
    };
  }

  // --- Parse values array ---
  const values = body.values;
  if (!Array.isArray(values)) {
    return {
      ok:       false,
      provider: 'twelvedata',
      error:    {
        code:    'PARSE_ERROR',
        message: `Twelve Data response for "${symbol}" is missing the "values" array.`,
      },
    };
  }

  if (values.length === 0) {
    warnings.push(`Twelve Data returned 0 candles for "${symbol}" (${timeframe}) in the requested range.`);
    return { ok: true, candles: [], provider: 'twelvedata', warnings };
  }

  // Map to raw candle format.
  // datetime is 'YYYY-MM-DD HH:mm:ss' for intraday or 'YYYY-MM-DD' for daily.
  // We parse to ISO so normalizeCandle handles it correctly.
  const candles = values.map(bar => ({
    timestamp: new Date(bar.datetime).toISOString(),
    open:      parseFloat(bar.open),
    high:      parseFloat(bar.high),
    low:       parseFloat(bar.low),
    close:     parseFloat(bar.close),
    volume:    parseFloat(bar.volume != null ? bar.volume : 0),
  }));

  return { ok: true, candles, provider: 'twelvedata', warnings };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  fetchHistoricalCandles,
  TIMEFRAME_MAP,
};
