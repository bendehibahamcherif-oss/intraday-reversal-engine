'use strict';

/**
 * polygonHistoricalProvider.js
 * Polygon.io historical candle provider.
 *
 * - Requires a Polygon.io API key.
 * - Uses the v2 Aggregates (Bars) endpoint.
 * - Supports pagination via response.next_url (max 10 pages).
 * - Returns raw candles; the caller normalizes via canonicalSchema.
 */

// ---------------------------------------------------------------------------
// Timeframe mapping
// ---------------------------------------------------------------------------

/**
 * Canonical timeframe → { multiplier, timespan }
 * as expected by the Polygon v2 aggregates endpoint.
 */
const TIMEFRAME_MAP = {
  '1m':  { multiplier: 1,  timespan: 'minute' },
  '5m':  { multiplier: 5,  timespan: 'minute' },
  '15m': { multiplier: 15, timespan: 'minute' },
  '30m': { multiplier: 30, timespan: 'minute' },
  '1h':  { multiplier: 1,  timespan: 'hour'   },
  '1d':  { multiplier: 1,  timespan: 'day'    },
};

const MAX_PAGES = 10;

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

/**
 * Fetch a URL with an AbortSignal.
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
    // ignore non-JSON body
  }

  return { ok: response.ok, status: response.status, body };
}

/**
 * Single timed request with a 30-second timeout.
 * @param {string} url
 * @returns {Promise<{ ok: boolean, status: number, body: any, rawError?: Error }>}
 */
async function timedFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetchJSON(url, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Error builders
// ---------------------------------------------------------------------------

function networkError(err) {
  const isTimeout = err && err.name === 'AbortError';
  return {
    ok:       false,
    provider: 'polygon',
    error:    {
      code:    isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: isTimeout
        ? 'Polygon.io request timed out after 30 seconds.'
        : (err ? err.message : 'Unknown network error'),
    },
  };
}

function httpError(status, body) {
  if (status === 403 || status === 401) {
    return {
      ok:       false,
      provider: 'polygon',
      error:    {
        code:    'INVALID_API_KEY',
        message: 'Polygon.io rejected the API key (HTTP 403). Please check your POLYGON_API_KEY.',
      },
    };
  }
  if (status === 429) {
    return {
      ok:       false,
      provider: 'polygon',
      error:    {
        code:    'RATE_LIMIT',
        message: 'Polygon.io rate limit reached (HTTP 429). Please wait before retrying.',
      },
    };
  }
  if (status >= 500) {
    return {
      ok:       false,
      provider: 'polygon',
      error:    {
        code:    'SERVER_ERROR',
        message: `Polygon.io returned a server error (HTTP ${status}).`,
      },
    };
  }
  const msg = (body && (body.message || body.error)) || `HTTP ${status}`;
  return {
    ok:       false,
    provider: 'polygon',
    error:    { code: 'HTTP_ERROR', message: `Polygon.io error: ${msg}` },
  };
}

// ---------------------------------------------------------------------------
// Main provider function
// ---------------------------------------------------------------------------

/**
 * fetchHistoricalCandles — fetches OHLCV candles from Polygon.io.
 *
 * Raw candle shape returned:
 *   { t: isoString, o, h, l, c, v, vw, n }
 *
 * @param {Object}  opts
 * @param {string}  opts.symbol
 * @param {string}  opts.timeframe  canonical timeframe
 * @param {string}  opts.startDate  'YYYY-MM-DD'
 * @param {string}  opts.endDate    'YYYY-MM-DD'
 * @param {string}  [opts.apiKey]   Polygon API key
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   candles?: Object[],
 *   provider: 'polygon',
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
      provider: 'polygon',
      error:    {
        code:    'MISSING_API_KEY',
        message: 'Polygon requires an API key. Set POLYGON_API_KEY in your environment.',
      },
    };
  }

  // --- Timeframe validation ---
  const tf = TIMEFRAME_MAP[timeframe];
  if (!tf) {
    return {
      ok:       false,
      provider: 'polygon',
      error:    {
        code:    'INVALID_TIMEFRAME',
        message: `Timeframe "${timeframe}" is not supported by the Polygon provider. ` +
                 `Supported: ${Object.keys(TIMEFRAME_MAP).join(', ')}.`,
      },
    };
  }

  const { multiplier, timespan } = tf;

  // --- Build first-page URL ---
  const baseUrl =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol.toUpperCase())}` +
    `/range/${multiplier}/${timespan}/${startDate}/${endDate}` +
    `?adjusted=true&sort=asc&limit=50000&apiKey=${encodeURIComponent(apiKey)}`;

  // --- Paginated fetch ---
  const allResults = [];
  let nextUrl = baseUrl;
  let page    = 0;

  while (nextUrl && page < MAX_PAGES) {
    page++;

    const result = await timedFetch(nextUrl);

    if (result.rawError) {
      return networkError(result.rawError);
    }

    if (!result.ok) {
      return httpError(result.status, result.body);
    }

    const body = result.body;

    // Polygon may return status "ERROR" in the body even on HTTP 200
    if (body && (body.status === 'ERROR' || body.status === 'NOT_FOUND')) {
      const msg = (body.message || body.error) || `Polygon status: ${body.status}`;
      return {
        ok:       false,
        provider: 'polygon',
        error:    { code: 'PROVIDER_ERROR', message: msg },
      };
    }

    const results = Array.isArray(body && body.results) ? body.results : [];
    for (const r of results) {
      allResults.push({
        t:  r.t,   // epoch ms from Polygon
        o:  r.o,
        h:  r.h,
        l:  r.l,
        c:  r.c,
        v:  r.v,
        vw: r.vw,  // volume-weighted average price
        n:  r.n,   // number of transactions
      });
    }

    // Follow next_url if present (Polygon pagination)
    nextUrl = (body && body.next_url)
      ? `${body.next_url}&apiKey=${encodeURIComponent(apiKey)}`
      : null;
  }

  if (page >= MAX_PAGES && nextUrl) {
    warnings.push(
      `Polygon pagination limit reached (${MAX_PAGES} pages). ` +
      `Some candles at the end of the range may have been omitted.`
    );
  }

  if (allResults.length === 0) {
    warnings.push(
      `Polygon returned 0 results for "${symbol}" (${timeframe}) ` +
      `between ${startDate} and ${endDate}.`
    );
  }

  // Convert epoch ms timestamps to ISO strings for normalizeCandle compatibility.
  const candles = allResults.map(r => ({
    ...r,
    t: new Date(r.t).toISOString(),
  }));

  return { ok: true, candles, provider: 'polygon', warnings };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  fetchHistoricalCandles,
  TIMEFRAME_MAP,
};
