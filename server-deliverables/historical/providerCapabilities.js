'use strict';

/**
 * providerCapabilities.js
 * Provider capability matrix for the Historical Data Download Center.
 * Each entry describes what a provider supports, its credential requirements,
 * timeframe limits, and whether it is eligible for historical downloads.
 */

const fs = require('fs');

// ---------------------------------------------------------------------------
// Capability definitions
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ProviderCapability
 * @property {string}   id
 * @property {string}   label
 * @property {boolean}  requiresCredentials
 * @property {boolean}  historical          - supports historical (past) data
 * @property {boolean}  intraday            - supports intraday timeframes
 * @property {boolean}  realtime            - supports streaming/realtime data
 * @property {boolean}  supportsDateRange   - can query arbitrary date ranges
 * @property {string[]} supportedTimeframes - canonical timeframes available
 * @property {Object}   maxIntradayDays     - per-timeframe day-range limits
 * @property {string[]} limitations         - human-readable caveats
 * @property {boolean}  allowedForHistoricalDownload
 */

const PROVIDER_CAPABILITIES = {

  yahoo: {
    id:                   'yahoo',
    label:                'Yahoo Finance',
    requiresCredentials:  false,
    historical:           true,
    intraday:             true,
    realtime:             false,
    supportsDateRange:    true,
    supportedTimeframes:  ['1m', '5m', '15m', '30m', '1h', '1d'],
    maxIntradayDays: {
      '1m':  7,
      '5m':  60,
      '15m': 60,
      '30m': 60,
      '1h':  730,
      '1d':  Infinity,   // effectively unlimited
    },
    limitations: [
      'No API key required — subject to rate limiting from Yahoo.',
      '1-minute data limited to the last 7 days.',
      '5m/15m/30m limited to the last 60 days.',
      '1-hour data limited to the last 730 days (~2 years).',
      'Data quality and availability not guaranteed.',
    ],
    allowedForHistoricalDownload: true,
  },

  alphaVantage: {
    id:                   'alphaVantage',
    label:                'Alpha Vantage',
    requiresCredentials:  true,
    historical:           true,
    intraday:             true,
    realtime:             false,
    supportsDateRange:    false, // monthly slices only; limited date range control
    supportedTimeframes:  ['1m', '5m', '15m', '30m', '1h', '1d'],
    maxIntradayDays: {
      '1m':  30,   // per monthly slice
      '5m':  30,
      '15m': 30,
      '30m': 30,
      '1h':  30,
      '1d':  Infinity,
    },
    limitations: [
      'Requires an Alpha Vantage API key (ALPHA_VANTAGE_API_KEY).',
      'Intraday data is fetched one calendar month at a time; large ranges require many requests.',
      'Free tier is limited to 25 API requests per day.',
      'Date range selection is limited to monthly slices for intraday timeframes.',
    ],
    allowedForHistoricalDownload: true,
  },

  polygon: {
    id:                   'polygon',
    label:                'Polygon.io',
    requiresCredentials:  true,
    historical:           true,
    intraday:             true,
    realtime:             true,
    supportsDateRange:    true,
    supportedTimeframes:  ['1m', '5m', '15m', '30m', '1h', '1d'],
    maxIntradayDays: {
      '1m':  Infinity,
      '5m':  Infinity,
      '15m': Infinity,
      '30m': Infinity,
      '1h':  Infinity,
      '1d':  Infinity,
    },
    limitations: [
      'Requires a Polygon.io API key (POLYGON_API_KEY).',
      'Free tier restricts data to the previous day (15-minute delay).',
      'Paid tier required for full historical and real-time access.',
      'Rate limited based on subscription tier.',
    ],
    allowedForHistoricalDownload: true,
  },

  twelvedata: {
    id:                   'twelvedata',
    label:                'Twelve Data',
    requiresCredentials:  true,
    historical:           true,
    intraday:             true,
    realtime:             true,
    supportsDateRange:    true,
    supportedTimeframes:  ['1m', '5m', '15m', '30m', '1h', '1d'],
    maxIntradayDays: {
      '1m':  Infinity,
      '5m':  Infinity,
      '15m': Infinity,
      '30m': Infinity,
      '1h':  Infinity,
      '1d':  Infinity,
    },
    limitations: [
      'Requires a Twelve Data API key (TWELVEDATA_API_KEY).',
      'Free tier limited to 8 API credits per minute and 800 per day.',
      'outputsize capped at 5000 rows per request; large ranges may require pagination.',
    ],
    allowedForHistoricalDownload: true,
  },

  fallback_demo: {
    id:                   'fallback_demo',
    label:                'Demo / Fallback (synthetic data)',
    requiresCredentials:  false,
    historical:           false,
    intraday:             false,
    realtime:             false,
    supportsDateRange:    false,
    supportedTimeframes:  [],
    maxIntradayDays:      {},
    limitations: [
      'Synthetic demo data only — not suitable for real analysis.',
      'Not available for historical downloads.',
    ],
    allowedForHistoricalDownload: false,
  },

};

// ---------------------------------------------------------------------------
// Public accessors
// ---------------------------------------------------------------------------

/**
 * Returns an array of all provider capability objects.
 * @returns {ProviderCapability[]}
 */
function getProviders() {
  return Object.values(PROVIDER_CAPABILITIES);
}

/**
 * Returns the capability object for a single provider by id, or null.
 * @param {string} id
 * @returns {ProviderCapability|null}
 */
function getProvider(id) {
  return PROVIDER_CAPABILITIES[id] || null;
}

/**
 * Returns the default provider id.
 *
 * Strategy:
 *  1. If providerStateFilePath is given and the file exists, parse it and
 *     return the first provider whose id is configured and allowed.
 *  2. Fall back to 'yahoo' (never requires credentials, always safe).
 *
 * @param {string} [providerStateFilePath]  Optional path to a JSON provider-
 *                                          state file produced by the credential
 *                                          configuration UI.
 * @returns {string}  provider id
 */
function getDefaultProvider(providerStateFilePath) {
  if (providerStateFilePath) {
    try {
      const raw = fs.readFileSync(providerStateFilePath, 'utf8');
      const state = JSON.parse(raw);

      // state may be an object keyed by provider id, or an array.
      const entries = Array.isArray(state) ? state : Object.entries(state).map(([id, cfg]) => ({ id, ...cfg }));

      for (const entry of entries) {
        const id  = entry.id || entry.provider;
        const cap = PROVIDER_CAPABILITIES[id];
        if (cap && cap.allowedForHistoricalDownload) {
          // Accept if it either doesn't need credentials or has a key configured.
          if (!cap.requiresCredentials || entry.apiKey || entry.key || entry.configured) {
            return id;
          }
        }
      }
    } catch (_err) {
      // File missing or unparseable — fall through to default.
    }
  }

  return 'yahoo';
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  PROVIDER_CAPABILITIES,
  getProviders,
  getProvider,
  getDefaultProvider,
};
