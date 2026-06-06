'use strict';

/**
 * historicalDataService.js
 * Main orchestrator for the Historical Data Download Center.
 *
 * Usage:
 *   const { downloadHistoricalData, getProviders } = require('./historicalDataService');
 */

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

const { PROVIDER_CAPS, SUPPORTED_TIMEFRAMES, SUPPORTED_SESSIONS, SUPPORTED_PURPOSES, getProviders } = require('./providerCapabilities');
const registry      = require('./historicalDatasetRegistry');
const canonicalSchema = require('./canonicalSchema');

const MAX_SYMBOLS = 20;

const providers = {
  yahoo:        require('./providers/yahooHistoricalProvider'),
  polygon:      require('./providers/polygonHistoricalProvider'),
  alphaVantage: require('./providers/alphaVantageHistoricalProvider'),
  twelvedata:   require('./providers/twelveDataHistoricalProvider'),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize a string for use in a file path segment (no traversal chars).
 */
function sanitizePathSegment(s) {
  return String(s).replace(/[^A-Za-z0-9_\-\.]/g, '_');
}

/**
 * Determine the first viable provider when provider === 'auto'.
 * Order: polygon → alphaVantage → twelvedata → yahoo
 */
function resolveAutoProvider() {
  if (process.env.POLYGON_API_KEY) return 'polygon';
  if (process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHAVANTAGE_API_KEY) return 'alphaVantage';
  if (process.env.TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY) return 'twelvedata';
  return 'yahoo';
}

/**
 * Resolve the API key for a given provider from env.
 * Returns null when the provider needs no key.
 * Returns undefined when the key is required but absent.
 */
function resolveApiKey(providerName) {
  switch (providerName) {
    case 'polygon':
      return process.env.POLYGON_API_KEY || undefined;
    case 'alphaVantage':
      return process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHAVANTAGE_API_KEY || undefined;
    case 'twelvedata':
      return process.env.TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY || undefined;
    case 'yahoo':
      return null; // no key needed
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Main download function
// ---------------------------------------------------------------------------

/**
 * Download historical candle data for one or more symbols.
 *
 * @param {object} opts
 * @param {string}   opts.provider       Provider id or 'auto'
 * @param {string[]} opts.symbols        Array of ticker symbols
 * @param {string}   opts.timeframe      e.g. '1d', '1h', '5m'
 * @param {string}   opts.startDate      ISO date string
 * @param {string}   opts.endDate        ISO date string
 * @param {string}   [opts.session]      'RTH' | 'EXTENDED' | 'ALL'  (default 'RTH')
 * @param {string[]} [opts.outputFormat] subset of ['csv','json']     (default ['csv'])
 * @param {string}   [opts.purpose]      Download purpose             (default 'general')
 * @param {boolean}  [opts.forceRefresh] Skip cache when true         (default false)
 * @returns {Promise<object>}
 */
async function downloadHistoricalData({
  provider,
  symbols,
  timeframe,
  startDate,
  endDate,
  session      = 'RTH',
  outputFormat = ['csv'],
  purpose      = 'general',
  forceRefresh = false,
}) {
  // ── Validation ──────────────────────────────────────────────────────────────

  // symbols: non-empty array of strings, max 20
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return { ok: false, error: { code: 'INVALID_SYMBOLS', message: 'symbols must be a non-empty array.' } };
  }
  if (symbols.length > MAX_SYMBOLS) {
    return { ok: false, error: { code: 'TOO_MANY_SYMBOLS', message: `Maximum ${MAX_SYMBOLS} symbols per request; got ${symbols.length}.` } };
  }
  if (!symbols.every((s) => typeof s === 'string' && s.trim().length > 0)) {
    return { ok: false, error: { code: 'INVALID_SYMBOLS', message: 'All symbols must be non-empty strings.' } };
  }
  const normalizedSymbols = symbols.map((s) => s.trim().toUpperCase());

  // timeframe
  if (!timeframe || !SUPPORTED_TIMEFRAMES.has(timeframe)) {
    return { ok: false, error: { code: 'INVALID_TIMEFRAME', message: `timeframe '${timeframe}' is not supported. Supported: ${[...SUPPORTED_TIMEFRAMES].join(', ')}.` } };
  }

  // dates
  const startMs = Date.parse(startDate);
  const endMs   = Date.parse(endDate);
  if (isNaN(startMs)) {
    return { ok: false, error: { code: 'INVALID_DATE_RANGE', message: `startDate '${startDate}' is not a valid date.` } };
  }
  if (isNaN(endMs)) {
    return { ok: false, error: { code: 'INVALID_DATE_RANGE', message: `endDate '${endDate}' is not a valid date.` } };
  }
  if (startMs >= endMs) {
    return { ok: false, error: { code: 'INVALID_DATE_RANGE', message: 'startDate must be before endDate.' } };
  }

  // session
  if (!SUPPORTED_SESSIONS.has(session)) {
    return { ok: false, error: { code: 'INVALID_SESSION', message: `session '${session}' is not supported. Supported: ${[...SUPPORTED_SESSIONS].join(', ')}.` } };
  }

  // purpose
  if (!SUPPORTED_PURPOSES.has(purpose)) {
    return { ok: false, error: { code: 'INVALID_PURPOSE', message: `purpose '${purpose}' is not supported. Supported: ${[...SUPPORTED_PURPOSES].join(', ')}.` } };
  }

  // outputFormat
  if (!Array.isArray(outputFormat) || outputFormat.length === 0) {
    outputFormat = ['csv'];
  }
  outputFormat = outputFormat.filter((f) => ['csv', 'json'].includes(f));
  if (outputFormat.length === 0) outputFormat = ['csv'];

  // forceRefresh
  forceRefresh = Boolean(forceRefresh);

  // Reject demo provider
  if (provider === 'fallback_demo') {
    return { ok: false, error: { code: 'DEMO_NOT_ALLOWED', message: 'fallback_demo cannot be used as a historical data source.' } };
  }

  // Auto provider selection
  if (provider === 'auto') {
    provider = resolveAutoProvider();
  }

  // Validate provider name
  if (!providers[provider]) {
    return { ok: false, error: { code: 'PROVIDER_FETCH_FAILED', message: `Unknown provider '${provider}'.` } };
  }

  // ── Cache check ─────────────────────────────────────────────────────────────

  const datasetId = registry.generateDatasetId({
    provider,
    symbols: normalizedSymbols,
    timeframe,
    startDate,
    endDate,
    session,
  });

  if (!forceRefresh) {
    const cached = registry.get(datasetId);
    if (cached && cached.status === 'ready') {
      return {
        ok:          true,
        jobId:       cached.jobId || crypto.randomUUID(),
        status:      'completed',
        provider:    cached.provider,
        symbols:     cached.symbols,
        timeframe:   cached.timeframe,
        startDate:   cached.startDate,
        endDate:     cached.endDate,
        session:     cached.session,
        rowCount:    cached.rowCount,
        rowsBySymbol: cached.rowsBySymbol || {},
        files:       cached.files,
        datasetId,
        warnings:    cached.warnings || [],
        cached:      true,
      };
    }
  }

  // ── Provider credential check ────────────────────────────────────────────────

  const cap = PROVIDER_CAPS[provider];
  const apiKey = resolveApiKey(provider);

  if (cap && cap.requiresKey && !apiKey) {
    return {
      ok: false,
      error: {
        code:    'PROVIDER_NOT_CONFIGURED',
        message: `Provider '${provider}' requires an API key. Please set one of: ${(cap.envVars || []).join(', ')}.`,
      },
    };
  }

  // ── Download loop ────────────────────────────────────────────────────────────

  const providerImpl  = providers[provider];
  const allCandles    = [];
  const rowsBySymbol  = {};
  const allWarnings   = [];

  for (const symbol of normalizedSymbols) {
    let fetchResult;
    try {
      fetchResult = await providerImpl.fetchHistoricalCandles({
        symbol,
        timeframe,
        startDate,
        endDate,
        apiKey,
        session,
      });
    } catch (err) {
      return {
        ok:     false,
        status: 'failed',
        error:  { code: 'PROVIDER_FETCH_FAILED', message: `Fetch error for ${symbol}: ${err.message}` },
      };
    }

    if (!fetchResult.ok) {
      return {
        ok:     false,
        status: 'failed',
        error:  fetchResult.error,
      };
    }

    const rawCandles = fetchResult.candles || [];
    const { candles: cleanCandles, warnings } = canonicalSchema.validateAndClean(rawCandles, {
      session,
      provider,
      symbol,
      timeframe,
    });

    rowsBySymbol[symbol] = cleanCandles.length;
    if (warnings.length > 0) {
      allWarnings.push(...warnings.map((w) => `[${symbol}] ${w}`));
    }

    for (const c of cleanCandles) {
      allCandles.push(c);
    }
  }

  // Sort all candles by timestamp ascending
  allCandles.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

  const rowCount = allCandles.length;

  // ── File writing ─────────────────────────────────────────────────────────────

  const DATA_DIR = path.join(process.cwd(), 'data', 'historical');
  const purposeDir = path.join(DATA_DIR, sanitizePathSegment(purpose));

  // Ensure directories exist
  fs.mkdirSync(purposeDir, { recursive: true });

  // Build safe base file name
  const symbolsStr = normalizedSymbols.length <= 3
    ? normalizedSymbols.map(sanitizePathSegment).join('_')
    : normalizedSymbols.slice(0, 3).map(sanitizePathSegment).join('_') + '_...';

  const safeTimeframe  = sanitizePathSegment(timeframe);
  const safeSession    = sanitizePathSegment(session);
  const safeStartDate  = sanitizePathSegment(startDate.slice(0, 10));
  const safeEndDate    = sanitizePathSegment(endDate.slice(0, 10));

  const baseName = `${symbolsStr}_${safeTimeframe}_${safeSession}_${safeStartDate}_${safeEndDate}`;

  const files = { csv: null, json: null };

  if (outputFormat.includes('csv')) {
    const csvPath = path.join(purposeDir, `${baseName}.csv`);
    const rows = [canonicalSchema.CSV_HEADER];
    for (const c of allCandles) {
      rows.push(canonicalSchema.toCsvRow(c));
    }
    fs.writeFileSync(csvPath, rows.join('\n'), 'utf8');
    files.csv = csvPath;
  }

  if (outputFormat.includes('json')) {
    const jsonPath = path.join(purposeDir, `${baseName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(allCandles, null, 2), 'utf8');
    files.json = jsonPath;
  }

  // Compute data hash
  const dataHash = crypto
    .createHash('sha256')
    .update(`${rowCount}|${startDate}|${endDate}`)
    .digest('hex');

  // ── Registry ─────────────────────────────────────────────────────────────────

  const jobId = crypto.randomUUID();

  const record = {
    datasetId,
    jobId,
    status:       'ready',
    provider,
    symbols:      normalizedSymbols,
    timeframe,
    startDate,
    endDate,
    session,
    purpose,
    outputFormat,
    rowCount,
    rowsBySymbol,
    files,
    dataHash,
    warnings:     allWarnings,
    createdAt:    new Date().toISOString(),
  };

  registry.register(record);

  // ── Return ───────────────────────────────────────────────────────────────────

  return {
    ok:          true,
    jobId,
    status:      'completed',
    provider,
    symbols:     normalizedSymbols,
    timeframe,
    startDate,
    endDate,
    session,
    rowCount,
    rowsBySymbol,
    files,
    datasetId,
    warnings:    allWarnings,
  };
}

module.exports = { downloadHistoricalData, getProviders, MAX_SYMBOLS };
