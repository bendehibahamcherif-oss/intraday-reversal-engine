#!/usr/bin/env node
/**
 * scripts/seed-test-data.js
 *
 * Generates two real historical datasets (SPY + NFLX, 1d, ~90 trading days)
 * via the genuine Yahoo Finance pipeline — no synthetic fixtures.
 *
 * Usage:
 *   node scripts/seed-test-data.js
 *   TEST=1 node scripts/seed-test-data.js        # writes to data/test-historical/
 *   HISTORICAL_DATA_DIR=./data/my-dir node ...   # explicit override
 *
 * Outputs: SEED_MANIFEST.json in DATA_DIR, dataset IDs to stdout.
 */

import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ── Set DATA_DIR BEFORE loading any module that reads it ──────────────────────

if (process.env.TEST || process.env.NODE_ENV === 'test') {
  process.env.HISTORICAL_DATA_DIR ??= join(root, 'data', 'test-historical');
}
const DATA_DIR = process.env.HISTORICAL_DATA_DIR || join(root, 'data', 'historical');

// CJS require — needed because backend modules use CommonJS
const require = createRequire(import.meta.url);
const { downloadHistoricalData } = require('../server-deliverables/historical/historicalDataService');

// ~90 trading days = ~130 calendar days back
function dateRange() {
  const end   = new Date();
  const start = new Date(Date.now() - 130 * 24 * 3600 * 1000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate:   end.toISOString().slice(0, 10),
  };
}

async function seedSymbol(symbol, opts) {
  const label = `${symbol} 1d RTH`;
  console.log(`[seed] Downloading ${label} …`);
  const result = await downloadHistoricalData({
    provider:    'yahoo',
    symbols:     [symbol],
    timeframe:   '1d',
    session:     'RTH',
    purpose:     'correlation',
    outputFormat: ['csv'],
    forceRefresh: false,
    ...opts,
  });

  if (!result.ok) {
    const msg = result.error?.message || JSON.stringify(result);
    throw new Error(`[seed] ${label} failed: ${msg}`);
  }

  const rows = result.rowsBySymbol?.[symbol] ?? result.rowCount ?? 0;
  console.log(`[seed] ${label} → ${result.datasetId}  rows=${rows}  ${result.cached ? '(cached)' : '(fresh)'}`);
  return result;
}

async function main() {
  const { startDate, endDate } = dateRange();
  console.log(`[seed] Date range: ${startDate} → ${endDate}`);
  console.log(`[seed] DATA_DIR: ${DATA_DIR}`);

  mkdirSync(DATA_DIR, { recursive: true });

  const [spyResult, nflxResult] = await Promise.all([
    seedSymbol('SPY',  { startDate, endDate }),
    seedSymbol('NFLX', { startDate, endDate }),
  ]);

  const manifest = {
    seededAt:  new Date().toISOString(),
    startDate,
    endDate,
    dataDir:   DATA_DIR,
    datasets: {
      SPY:  { datasetId: spyResult.datasetId,  rows: spyResult.rowsBySymbol?.SPY  ?? spyResult.rowCount ?? 0 },
      NFLX: { datasetId: nflxResult.datasetId, rows: nflxResult.rowsBySymbol?.NFLX ?? nflxResult.rowCount ?? 0 },
    },
  };

  const manifestPath = join(DATA_DIR, 'SEED_MANIFEST.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`[seed] Manifest → ${manifestPath}`);
  console.log('[seed] Done:', JSON.stringify(manifest.datasets));

  // Emit for CI variable capture
  console.log(`SEED_SPY_ID=${manifest.datasets.SPY.datasetId}`);
  console.log(`SEED_NFLX_ID=${manifest.datasets.NFLX.datasetId}`);
}

main().catch((err) => {
  console.error('[seed] Fatal:', err.message || err);
  process.exit(1);
});
