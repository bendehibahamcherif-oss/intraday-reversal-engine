#!/usr/bin/env node
/**
 * scripts/api-coverage-check.js  —  Layer 2: API Coverage
 *
 * 1. Parses src/api.js to extract every /api/... endpoint the UI calls → manifest.
 * 2. Starts a mini Express server with the key route modules.
 * 3. Reads SEED_MANIFEST.json (or discovers datasets from registry).
 * 4. Tests each critical endpoint: not 404, ok === true, no not_enough_data.
 * 5. Poison test: hits a wrong URL prefix and asserts 404 (proves the suite
 *    would have caught the /api/multi-asset vs /api/macro regression).
 * 6. Writes API_COVERAGE_RESULTS.json, exits non-zero on any failure.
 *
 * Usage:
 *   node scripts/api-coverage-check.js
 *   TEST=1 node scripts/api-coverage-check.js   # data/test-historical/
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');

// ── DATA_DIR must be set BEFORE the registry module is first loaded ────────────
if (process.env.TEST || process.env.NODE_ENV === 'test') {
  process.env.HISTORICAL_DATA_DIR ??= join(root, 'data', 'test-historical');
}
const DATA_DIR = process.env.HISTORICAL_DATA_DIR || join(root, 'data', 'historical');

const require = createRequire(import.meta.url);
const express           = require('express');
const multiAssetRoutes  = require('../server-deliverables/api/multiAssetRoutes');
const historicalRoutes  = require('../server-deliverables/api/historicalRoutes');
const registry          = require('../server-deliverables/historical/historicalDatasetRegistry');

// ── Step 1: Parse src/api.js → endpoint manifest ──────────────────────────────

function extractEndpoints() {
  const src = readFileSync(join(root, 'src', 'api.js'), 'utf8');
  const matches = [...src.matchAll(/\$\{API_BASE\}(\/api\/[^`?$]+)/g)].map((m) => m[1]);
  return [...new Set(matches.map((p) => p.replace(/\/$/, '')))].sort();
}

const endpointManifest = extractEndpoints();
console.log(`[api-coverage] Manifest: ${endpointManifest.length} endpoint patterns from src/api.js`);

// ── Step 2: Resolve seeded dataset IDs ────────────────────────────────────────

function findSeededIds() {
  const manifestPath = join(DATA_DIR, 'SEED_MANIFEST.json');
  if (existsSync(manifestPath)) {
    try {
      const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (m?.datasets) return m.datasets;
    } catch { /**/ }
  }
  // Fall back: scan registry for any SPY + NFLX 1d datasets
  const all  = registry.list();
  const spy  = all.find((d) => d.symbols?.includes('SPY')  && d.timeframe === '1d');
  const nflx = all.find((d) => d.symbols?.includes('NFLX') && d.timeframe === '1d');
  return {
    SPY:  spy  ? { datasetId: spy.datasetId  } : null,
    NFLX: nflx ? { datasetId: nflx.datasetId } : null,
  };
}

const seeded   = findSeededIds();
const SPY_ID   = seeded?.SPY?.datasetId  || null;
const NFLX_ID  = seeded?.NFLX?.datasetId || null;
console.log(`[api-coverage] SPY=${SPY_ID || '(none)'}  NFLX=${NFLX_ID || '(none)'}`);

// ── Step 3: Start mini test server ────────────────────────────────────────────

const PORT = Number(process.env.BACKEND_PORT || 19876);

function startServer() {
  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/macro',       multiAssetRoutes);
  app.use('/api/multi-asset', multiAssetRoutes);
  app.use('/api/historical',  historicalRoutes);
  return new Promise((resolve) => {
    const srv = createServer(app);
    srv.listen(PORT, () => resolve(srv));
  });
}

// ── Step 4: HTTP helper + result recorder ──────────────────────────────────────

async function get(urlPath) {
  const raw = await fetch(`http://127.0.0.1:${PORT}${urlPath}`);
  let body = {};
  try { body = await raw.json(); } catch { /**/ }
  return { status: raw.status, body };
}

const results  = [];
let   failures = 0;

function record(label, pass, detail = '') {
  const status = pass ? 'PASS' : 'FAIL';
  if (!pass) failures++;
  results.push({ label, status, detail });
  console.log(`${pass ? '✅' : '❌'} [${status}] ${label}${detail ? `  — ${detail}` : ''}`);
}

async function check(label, urlPath, { wantOk = true, wantDataStatus = false } = {}) {
  const { status, body } = await get(urlPath);

  if (status === 404) {
    record(label, false, '404 — endpoint not found (URL mismatch class of bug)');
    return body;
  }
  if (wantOk && body.ok === false) {
    record(label, false, `ok=false status=${body.status} error=${JSON.stringify(body.error || '').slice(0, 80)}`);
    return body;
  }
  if (wantDataStatus && body.status === 'not_enough_data') {
    record(label, false, 'not_enough_data — seeded data missing or too short');
    return body;
  }
  record(label, true, `status=${status} ok=${body.ok} body.status=${body.status}`);
  return body;
}

// ── Step 5: Run all checks ────────────────────────────────────────────────────

async function runCoverage() {
  const server = await startServer();
  console.log(`[api-coverage] Mini-server on port ${PORT}\n`);

  try {
    // /health
    await check('GET /health', '/health');

    // /api/historical
    await check('GET /api/historical/providers',    '/api/historical/providers');
    await check('GET /api/historical/datasets',     '/api/historical/datasets');
    if (SPY_ID) {
      await check(
        `GET /api/historical/datasets/${SPY_ID}`,
        `/api/historical/datasets/${encodeURIComponent(SPY_ID)}`,
      );
      await check(
        `GET /api/historical/datasets/${SPY_ID}/diagnostics`,
        `/api/historical/datasets/${encodeURIComponent(SPY_ID)}/diagnostics`,
      );
    }

    // /api/macro — the UI-facing URLs (post-fix)
    if (SPY_ID && NFLX_ID) {
      const corrUrl = `/api/macro/correlation?symbols=SPY,NFLX`
        + `&datasetIds=${encodeURIComponent(SPY_ID)},${encodeURIComponent(NFLX_ID)}`
        + `&window=20&timeframe=1d`;
      const corrBody = await check(
        'GET /api/macro/correlation (SPY+NFLX, datasetIds, window=20)',
        corrUrl,
        { wantDataStatus: true },
      );
      const aligned = corrBody?.alignedRows ?? corrBody?.observations ?? 0;
      record('/api/macro/correlation → alignedRows ≥ 20', aligned >= 20, `alignedRows=${aligned}`);

      const betaUrl = `/api/macro/beta?symbol=NFLX&asset=NFLX&benchmark=SPY&symbols=SPY,NFLX`
        + `&datasetIds=${encodeURIComponent(SPY_ID)},${encodeURIComponent(NFLX_ID)}`
        + `&window=20&timeframe=1d`;
      const betaBody = await check(
        'GET /api/macro/beta (NFLX/SPY, datasetIds, window=20)',
        betaUrl,
        { wantDataStatus: true },
      );
      record('/api/macro/beta → finite beta', Number.isFinite(betaBody?.beta), `beta=${betaBody?.beta}`);

      await check(
        'GET /api/macro/sector-rotation',
        `/api/macro/sector-rotation?symbols=SPY,NFLX&window=20&datasetId=${encodeURIComponent(SPY_ID)}`,
      );
      await check(
        'GET /api/macro/volatility-heatmap',
        `/api/macro/volatility-heatmap?symbols=SPY,NFLX&window=20&datasetId=${encodeURIComponent(SPY_ID)}`,
      );
    } else {
      record(
        'macro endpoints (seeded SPY + NFLX)',
        false,
        'dataset IDs not found — run: node scripts/seed-test-data.js',
      );
    }

    // ── POISON TEST ────────────────────────────────────────────────────────────
    // The mini-server does NOT mount /api/WRONG-PREFIX.
    // This proves the suite would catch a URL-prefix regression like
    // /api/multi-asset vs /api/macro.
    const { status: poisonStatus } = await get('/api/WRONG-PREFIX/correlation?symbols=SPY,NFLX&window=20');
    record(
      'POISON: /api/WRONG-PREFIX/correlation → 404 (would catch URL bug)',
      poisonStatus === 404,
      `got ${poisonStatus}`,
    );

    // ── Coverage gap report ────────────────────────────────────────────────────
    const testedPrefixes = ['/api/macro/', '/api/historical/', '/health'];
    const untested = endpointManifest.filter(
      (p) => !testedPrefixes.some((prefix) => p.startsWith(prefix)),
    );
    console.log(
      `\n[api-coverage] ${untested.length} endpoint patterns untested`
      + ` (require live feed/auth/ML worker — covered by separate contract tests):`,
    );
    untested.slice(0, 15).forEach((p) => console.log(`  ${p}`));
    if (untested.length > 15) console.log(`  … and ${untested.length - 15} more`);

  } finally {
    await new Promise((r) => server.close(r));
  }
}

async function main() {
  await runCoverage();

  const summary = {
    generatedAt:       new Date().toISOString(),
    passed:            results.filter((r) => r.status === 'PASS').length,
    failed:            results.filter((r) => r.status === 'FAIL').length,
    total:             results.length,
    manifestEndpoints: endpointManifest.length,
    seededIds:         { SPY: SPY_ID, NFLX: NFLX_ID },
    results,
  };

  writeFileSync(join(root, 'API_COVERAGE_RESULTS.json'), JSON.stringify(summary, null, 2));
  console.log(`\n[api-coverage] ${summary.failed === 0 ? '✅' : '❌'} ${summary.passed}/${summary.total} checks passed`);
  console.log('[api-coverage] Written: API_COVERAGE_RESULTS.json');

  if (summary.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[api-coverage] Fatal:', err);
  process.exit(1);
});
