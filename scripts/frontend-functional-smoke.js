#!/usr/bin/env node
/**
 * Frontend functional smoke — static + pure-logic invariants that guard the
 * platform stabilization fixes against regressions. Runs in plain Node (no
 * browser): it inspects source for endpoint/contract invariants and exercises
 * the pure payload helpers. Component-level behaviour is covered by the Vitest
 * suite (npm test). Emits FRONTEND_FUNCTIONAL_SMOKE_RESULTS.json.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { stripUndefinedDeep, assertNoUndefinedDeep } from '../src/utils/payload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const results = [];
function check(name, fn) {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail || 'ok' });
  } catch (err) {
    results.push({ name, ok: false, detail: err.message });
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ── 1. ML lifecycle endpoints are canonical /api/ml/* ─────────────────────────
const apiSrc = read('src/api.js');
check('promote uses /api/ml/promote/:modelId', () => {
  assert(/setChampionModel[\s\S]{0,160}\/api\/ml\/promote\//.test(apiSrc), 'setChampionModel must POST /api/ml/promote/:modelId');
  return 'POST /api/ml/promote/:modelId';
});
check('no dead /api/ai model lifecycle routes remain', () => {
  assert(!/\/api\/ai\/models\//.test(apiSrc), 'dead /api/ai/models/* route still present in api.js');
  return 'none';
});
check('feature-importance uses /api/ml/feature-importance', () => {
  assert(/getMLFeatureImportance[\s\S]{0,200}\/api\/ml\/feature-importance/.test(apiSrc), 'feature importance must hit /api/ml/feature-importance');
  return 'GET /api/ml/feature-importance';
});
check('compareMLModels does not call a dead endpoint', () => {
  assert(/compareMLModels[\s\S]{0,160}throw new Error/.test(apiSrc), 'compareMLModels must fail fast, not call a dead route');
  return 'fails fast';
});
check('backtest run is POST /api/backtest/run', () => {
  assert(/\/api\/backtest\/run/.test(apiSrc), 'backtest run endpoint missing');
  return 'POST /api/backtest/run';
});

// ── 2. No undefined datasetId is ever sent (pure helper) ──────────────────────
check('stripUndefinedDeep removes undefined datasetId', () => {
  const out = stripUndefinedDeep({ symbol: 'SPY', datasetId: undefined, nested: { a: undefined, b: 1 } });
  assert(!('datasetId' in out), 'datasetId should be stripped');
  assert(!('a' in out.nested) && out.nested.b === 1, 'nested undefined should be stripped');
  assertNoUndefinedDeep(out);
  return JSON.stringify(out);
});
check('runBacktest omits datasetId when none selected', () => {
  // Source contract: datasetId only spread when truthy.
  assert(/\.\.\.\(datasetId \? \{ datasetId \} : \{\}\)/.test(apiSrc), 'runBacktest must conditionally include datasetId');
  return 'conditional';
});

// ── 3. NaN-safe rendering helpers ─────────────────────────────────────────────
check('AILab fmtN guards non-finite values', () => {
  const src = read('src/workspaces/AILabWorkspace.jsx');
  assert(/Number\.isFinite\(n\) \? n\.toFixed/.test(src), 'fmtN must guard with Number.isFinite');
  return 'Number.isFinite guard present';
});
check('Replay chart guards empty candle array', () => {
  const src = read('src/workspaces/ReplayWorkspace.jsx');
  assert(/visibleData\.length === 0/.test(src), 'Replay must guard empty visibleData before Math.min/max');
  return 'empty-array guard present';
});

// ── 4. Error boundaries — scoped fallback ─────────────────────────────────────
check('ErrorBoundary supports a scoped fallback prop', () => {
  const src = read('src/components/ErrorBoundary.jsx');
  assert(/this\.props\.fallback/.test(src), 'ErrorBoundary must honour a fallback prop');
  return 'fallback supported';
});
check('WorkspaceRenderer wraps workspaces in a scoped boundary', () => {
  const src = read('src/App.jsx');
  assert(/<ErrorBoundary[\s\S]{0,120}key=\{workspace\}[\s\S]{0,160}fallback=/.test(src), 'WorkspaceRenderer must wrap workspaces in a keyed ErrorBoundary with a fallback');
  return 'scoped boundary present';
});

// ── 5. WebSocket bounded reconnect ────────────────────────────────────────────
check('wsClient caps reconnect attempts', () => {
  const src = read('src/services/wsClient.js');
  assert(/maxReconnectAttempts/.test(src) && /reconnectAttempts >= this\.maxReconnectAttempts/.test(src), 'wsClient must stop after maxReconnectAttempts');
  assert(/reconnectNow\(\)/.test(src), 'wsClient must expose reconnectNow() to resume');
  return 'bounded + resumable';
});

// ── 6. localStorage hardening — JSON.parse guarded ────────────────────────────
check('corrupt localStorage does not crash (api.getUser guards JSON.parse)', () => {
  const src = read('src/api.js');
  assert(/getUser[\s\S]{0,160}try \{[\s\S]{0,120}JSON\.parse[\s\S]{0,80}catch/.test(src), 'getUser must wrap JSON.parse in try/catch');
  return 'guarded';
});

// ── Output ────────────────────────────────────────────────────────────────────
const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
const summary = {
  generatedAt: new Date().toISOString(),
  total: results.length,
  passed,
  failed,
  ok: failed === 0,
  checks: results,
};

const outPath = path.join(ROOT, 'FRONTEND_FUNCTIONAL_SMOKE_RESULTS.json');
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n');

for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
}
console.log(`\n${passed}/${results.length} checks passed → ${path.relative(ROOT, outPath)}`);
process.exit(failed === 0 ? 0 : 1);
