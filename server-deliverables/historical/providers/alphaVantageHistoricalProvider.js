'use strict';

/**
 * alphaVantageHistoricalProvider.js
 * Alpha Vantage historical candle provider.
 *
 * - Requires an Alpha Vantage API key.
 * - Daily data: TIME_SERIES_DAILY_ADJUSTED, outputsize=full, filter by date.
 * - Intraday data: TIME_SERIES_INTRADAY with monthly slices (one request per
 *   calendar month in the startDate…endDate range).
 * - Returns raw candles; the caller normalizes via canonicalSchema.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Canonical timeframe → Alpha Vantage interval string (null for daily) */
const AV_INTERVAL_MAP = {
  '1m':  '1min',
  '5m':  '5min',
  '15m': '15min',
  '30m': '30min',
  '1h':  '60min',
  '1d':  null,   // uses TIME_SERIES_DAILY_ADJUSTED
};

const TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

/**
 * Fetch URL with AbortSignal, returning parsed JSON.
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

/**
 * Single timed fetch (TIMEOUT_MS).
 * @param {string} url
 */
async function timedFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchJSON(url, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Return an array of 'YYYY-MM' strings covering startDate…endDate (inclusive).
 * @param {string} startDate 'YYYY-MM-DD'
 * @param {string} endDate   'YYYY-MM-DD'
 * @returns {string[]}
 */
function monthsInRange(startDate, endDate) {
  const months = [];
  const start  = new Date(startDate);
  const end    = new Date(endDate);

  // Clamp to first of each month
  let cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

  while (cur <= last) {
    const year  = cur.getUTCFullYear();
    const month = String(cur.getUTCMonth() + 1).padStart(2, '0');
    months.push(`${year}-${month}`);
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return months;
}

// ---------------------------------------------------------------------------
// Response checkers
// ---------------------------------------------------------------------------

/**
 * Inspect an Alpha Vantage JSON body for known error/rate-limit fields.
 * Returns an error result object if a problem is detected, or null if clean.
 * @param {any} body
 * @returns {{ ok: false, provider: 'alphaVantage', error: object }|null}
 */
function checkBodyErrors(body) {
  if (!body) {
    return {
      ok:       false,
      provider: 'alphaVantage',
      error:    { code: 'EMPTY_RESPONSE', message: 'Alpha Vantage returned an empty response.' },
    };
  }
  if (body['Error Message']) {
    return {
      ok:       false,
      provider: 'alphaVantage',
      error:    { code: 'PROVIDER_ERROR', message: body['Error Message'] },
    };
  }
  if (body['Information']) {
    // Premium endpoint accessed on free tier
    return {
      ok:       false,
      provider: 'alphaVantage',
      error:    { code: 'RATE_LIMIT', message: body['Information'] },
    };
  }
  // "Note" is the rate-limit warning on free tier
  if (body['Note']) {
    return null; // handled as a warning, not a hard error, by callers
  }
  return null;
}

// ---------------------------------------------------------------------------
// Daily data fetcher
// ---------------------------------------------------------------------------

/**
 * Fetch daily (1d) adjusted candles for a symbol.
 * @param {string} symbol
 * @param {string} startDate 'YYYY-MM-DD'
 * @param {string} endDate   'YYYY-MM-DD'
 * @param {string} apiKey
 * @param {string[]} warnings  mutable array to push warnings into
 * @returns {Promise<{ ok: boolean, candles?: Object[], provider: 'alphaVantage', error?: object }>}
 */
async function fetchDailyCandles(symbol, startDate, endDate, apiKey, warnings) {
  const url =
    `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED` +
    `&symbol=${encodeURIComponent(symbol)}&outputsize=full&apikey=${encodeURIComponent(apiKey)}`;

  const result = await timedFetch(url);

  if (result.rawError) {
    const isTimeout = result.rawError.name === 'AbortError';
    return {
      ok:       false,
      provider: 'alphaVantage',
      error:    {
        code:    isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        message: isTimeout
          ? 'Alpha Vantage request timed out after 20 seconds.'
          : result.rawError.message,
      },
    };
  }

  if (!result.ok) {
    return {
      ok:       false,
      provider: 'alphaVantage',
      error:    {
        code:    'HTTP_ERROR',
        message: `Alpha Vantage returned HTTP ${result.status} for symbol "${symbol}".`,
      },
    };
  }

  const bodyErr = checkBodyErrors(result.body);
  if (bodyErr) return bodyErr;

  if (result.body['Note']) {
    warnings.push(
      `Alpha Vantage free-tier rate limit warning: ${result.body['Note']} ` +
      `Consider upgrading your plan for higher throughput.`
    );
  }

  const series = result.body['Time Series (Daily)'];
  if (!series || typeof series !== 'object') {
    return {
      ok:       false,
      provider: 'alphaVantage',
      error:    {
        code:    'PARSE_ERROR',
        message: `Could not find "Time Series (Daily)" in Alpha Vantage response for "${symbol}".`,
      },
    };
  }

  const startMs = Date.parse(startDate);
  const endMs   = Date.parse(endDate);

  const candles = [];
  for (const [dateStr, bar] of Object.entries(series)) {
    const ts = Date.parse(dateStr);
    if (isNaN(ts) || ts < startMs || ts > endMs) continue;
    candles.push({
      timestamp: `${dateStr}T00:00:00.000Z`,
      open:   parseFloat(bar['1. open']),
      high:   parseFloat(bar['2. high']),
      low:    parseFloat(bar['3. low']),
      close:  parseFloat(bar['5. adjusted close'] || bar['4. close']),
      volume: parseFloat(bar['6. volume'] || bar['5. volume'] || 0),
    });
  }

  // Sort ascending
  candles.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

  return { ok: true, candles, provider: 'alphaVantage', warnings };
}

// ---------------------------------------------------------------------------
// Intraday data fetcher (monthly slices)
// ---------------------------------------------------------------------------

/**
 * Fetch intraday candles using monthly slices.
 * Alpha Vantage intraday endpoint only returns one month per request.
 *
 * @param {string}   symbol
 * @param {string}   avInterval  '1min' | '5min' | '15min' | '30min' | '60min'
 * @param {string}   startDate   'YYYY-MM-DD'
 * @param {string}   endDate     'YYYY-MM-DD'
 * @param {string}   apiKey
 * @param {string[]} warnings    mutable warnings array
 * @returns {Promise<{ ok: boolean, candles?: Object[], provider: 'alphaVantage', error?: object }>}
 */
async function fetchIntradayCandles(symbol, avInterval, startDate, endDate, apiKey, warnings) {
  warnings.push(
    `Alpha Vantage intraday data uses monthly slices. ` +
    `One API request will be made per calendar month in the requested range.`
  );

  const months = monthsInRange(startDate, endDate);
  const startMs = Date.parse(startDate);
  const endMs   = Date.parse(endDate);

  const allCandles = [];

  for (const month of months) {
    const url =
      `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY` +
      `&symbol=${encodeURIComponent(symbol)}` +
      `&interval=${avInterval}` +
      `&outputsize=full` +
      `&extended_hours=false` +
      `&month=${month}` +
      `&apikey=${encodeURIComponent(apiKey)}`;

    const result = await timedFetch(url);

    if (result.rawError) {
      const isTimeout = result.rawError.name === 'AbortError';
      return {
        ok:       false,
        provider: 'alphaVantage',
        error:    {
          code:    isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
          message: isTimeout
            ? `Alpha Vantage request timed out after 20 seconds (month ${month}).`
            : result.rawError.message,
        },
      };
    }

    if (!result.ok) {
      return {
        ok:       false,
        provider: 'alphaVantage',
        error:    {
          code:    'HTTP_ERROR',
          message: `Alpha Vantage returned HTTP ${result.status} for "${symbol}" month ${month}.`,
        },
      };
    }

    const bodyErr = checkBodyErrors(result.body);
    if (bodyErr) return bodyErr;

    if (result.body['Note']) {
      warnings.push(
        `Alpha Vantage free-tier rate limit warning (month ${month}): ${result.body['Note']} ` +
        `Consider upgrading for unthrottled access.`
      );
      // Rate-limited — stop fetching further months
      break;
    }

    // The series key looks like "Time Series (5min)"
    const seriesKey = `Time Series (${avInterval})`;
    const series    = result.body[seriesKey];

    if (!series || typeof series !== 'object') {
      warnings.push(`No "${seriesKey}" data returned for "${symbol}" month ${month}. Skipping.`);
      continue;
    }

    for (const [dtStr, bar] of Object.entries(series)) {
      // dtStr format: 'YYYY-MM-DD HH:MM:SS'
      const ts = Date.parse(dtStr);
      if (isNaN(ts) || ts < startMs || ts > endMs) continue;
      allCandles.push({
        timestamp: new Date(ts).toISOString(),
        open:   parseFloat(bar['1. open']),
        high:   parseFloat(bar['2. high']),
        low:    parseFloat(bar['3. low']),
        close:  parseFloat(bar['4. close']),
        volume: parseFloat(bar['5. volume'] || 0),
      });
    }
  }

  // Sort ascending
  allCandles.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

  return { ok: true, candles: allCandles, provider: 'alphaVantage', warnings };
}

// ---------------------------------------------------------------------------
// Main provider function
// ---------------------------------------------------------------------------

/**
 * fetchHistoricalCandles — fetches OHLCV candles from Alpha Vantage.
 *
 * Raw candle shape:
 *   { timestamp: isoString, open, high, low, close, volume }
 *
 * @param {Object}  opts
 * @param {string}  opts.symbol
 * @param {string}  opts.timeframe  canonical timeframe
 * @param {string}  opts.startDate  'YYYY-MM-DD'
 * @param {string}  opts.endDate    'YYYY-MM-DD'
 * @param {string}  [opts.apiKey]   Alpha Vantage API key
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   candles?: Object[],
 *   provider: 'alphaVantage',
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
      provider: 'alphaVantage',
      error:    {
        code:    'MISSING_API_KEY',
        message: 'Alpha Vantage requires an API key. Set ALPHA_VANTAGE_API_KEY in your environment.',
      },
    };
  }

  // --- Timeframe validation ---
  if (!(timeframe in AV_INTERVAL_MAP)) {
    return {
      ok:       false,
      provider: 'alphaVantage',
      error:    {
        code:    'INVALID_TIMEFRAME',
        message: `Timeframe "${timeframe}" is not supported by the Alpha Vantage provider. ` +
                 `Supported: ${Object.keys(AV_INTERVAL_MAP).join(', ')}.`,
      },
    };
  }

  const avInterval = AV_INTERVAL_MAP[timeframe];

  if (timeframe === '1d') {
    return fetchDailyCandles(symbol, startDate, endDate, apiKey, warnings);
  }

  return fetchIntradayCandles(symbol, avInterval, startDate, endDate, apiKey, warnings);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  fetchHistoricalCandles,
  AV_INTERVAL_MAP,
  monthsInRange,
};
