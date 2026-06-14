#!/usr/bin/env node
/**
 * scripts/prod-smoke.js  —  Layer 3: Production Smoke
 *
 * Probes the live deployed stack and exits non-zero on any failure.
 * Handles Render.com cold-start (up to ~50 s) with exponential backoff.
 *
 * Env:
 *   BACKEND_URL   https://reversal.onrender.com
 *   FRONTEND_URL  https://intraday-reversal-engine.onrender.com
 *
 * Usage:
 *   node scripts/prod-smoke.js
 *   BACKEND_URL=https://... node scripts/prod-smoke.js
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');

const BACKEND_URL  = (process.env.BACKEND_URL  || 'https://reversal.onrender.com').replace(/\/$/, '');
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://intraday-reversal-engine.onrender.com').replace(/\/$/, '');
const MAX_ATTEMPTS = 8;
const INITIAL_DELAY = 2_000;

async function fetchRetry(url, label = url) {
  let delay = INITIAL_DELAY;
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20_000);
      const res   = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      console.log(`  [${i}/${MAX_ATTEMPTS}] ${label} → ${res.status}`);
      return res;
    } catch (err) {
      const msg    = err.name === 'AbortError' ? 'timeout' : err.message;
      const isLast = i === MAX_ATTEMPTS;
      console.log(`  [${i}/${MAX_ATTEMPTS}] ${label} → ${msg}${isLast ? '' : `, retry in ${delay / 1000}s`}`);
      if (isLast) throw new Error(`${label} failed: ${msg}`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 20_000);
    }
  }
}

const results  = [];
let   failures = 0;

function record(label, pass, detail = '') {
  if (!pass) failures++;
  results.push({ label, status: pass ? 'PASS' : 'FAIL', detail });
  console.log(`${pass ? '✅' : '❌'} [${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? `  — ${detail}` : ''}`);
}

async function checkHealth() {
  console.log('\n── Backend /health ───────────────────────────────────────');
  const res  = await fetchRetry(`${BACKEND_URL}/health`, 'GET /health');
  let body   = {};
  try { body = await res.json(); } catch { /**/ }
  record('GET /health → 200',      res.status === 200, `status=${res.status}`);
  record('GET /health → ok=true',  body.ok === true,   `ok=${body.ok}`);
}

async function checkProviders() {
  console.log('\n── /api/historical/providers ────────────────────────────');
  const res  = await fetchRetry(`${BACKEND_URL}/api/historical/providers`, 'GET /api/historical/providers');
  let body   = {};
  try { body = await res.json(); } catch { /**/ }
  record('GET /api/historical/providers → not 404', res.status !== 404,  `status=${res.status}`);
  record('GET /api/historical/providers → ok',      body.ok === true || Array.isArray(body.providers), `ok=${body.ok}`);
}

async function checkMacroRoute() {
  console.log('\n── /api/macro/correlation exists ────────────────────────');
  const res  = await fetchRetry(`${BACKEND_URL}/api/macro/correlation?symbols=SPY&window=20`, 'GET /api/macro/correlation');
  let body   = {};
  try { body = await res.json(); } catch { /**/ }
  record('/api/macro/correlation → not 404',        res.status !== 404,  `status=${res.status}`);
  record('/api/macro/correlation → known response', typeof body.ok === 'boolean' || typeof body.status === 'string',
    `ok=${body.ok} status=${body.status}`);
}

async function checkFrontend() {
  console.log('\n── Frontend SPA ──────────────────────────────────────────');
  const res  = await fetchRetry(FRONTEND_URL, 'GET frontend');
  const html = await res.text().catch(() => '');
  record('Frontend → 200',               res.status === 200,  `status=${res.status}`);
  record('Frontend HTML has mount point', html.includes('id="root"') || html.includes('<script'), `len=${html.length}`);
}

async function checkApiBaseInBundle() {
  console.log('\n── JS bundle embeds backend URL ─────────────────────────');
  try {
    const indexRes  = await fetchRetry(FRONTEND_URL, 'GET / for bundle link');
    const indexHtml = await indexRes.text().catch(() => '');
    const match     = indexHtml.match(/src="(\/assets\/index[^"]+\.js)"/);
    if (!match) {
      record('JS bundle link found', false, 'cannot parse <script src> from index.html');
      return;
    }
    const jsRes = await fetchRetry(`${FRONTEND_URL}${match[1]}`, 'GET JS bundle');
    const js    = await jsRes.text().catch(() => '');
    record(
      'JS bundle embeds reversal.onrender.com',
      js.includes('reversal.onrender.com'),
      js.includes('reversal.onrender.com') ? 'found' : 'missing — check VITE_API_BASE at build time',
    );
  } catch (err) {
    record('API base alignment', false, err.message);
  }
}

async function main() {
  console.log(`\n[prod-smoke] Backend:  ${BACKEND_URL}`);
  console.log(`[prod-smoke] Frontend: ${FRONTEND_URL}`);

  try { await checkHealth();         } catch (e) { record('Backend health',          false, e.message); }
  try { await checkProviders();      } catch (e) { record('/api/historical/providers', false, e.message); }
  try { await checkMacroRoute();     } catch (e) { record('/api/macro/correlation',    false, e.message); }
  try { await checkFrontend();       } catch (e) { record('Frontend load',             false, e.message); }
  try { await checkApiBaseInBundle();} catch (e) { record('API base in bundle',        false, e.message); }

  const passed  = results.filter((r) => r.status === 'PASS').length;
  const failed  = results.filter((r) => r.status === 'FAIL').length;
  const summary = {
    generatedAt:  new Date().toISOString(),
    backendUrl:   BACKEND_URL,
    frontendUrl:  FRONTEND_URL,
    passed, failed, total: results.length, results,
  };

  writeFileSync(join(root, 'PROD_SMOKE_RESULTS.json'), JSON.stringify(summary, null, 2));
  console.log(`\n[prod-smoke] ${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[prod-smoke] Fatal:', err);
  process.exit(1);
});
