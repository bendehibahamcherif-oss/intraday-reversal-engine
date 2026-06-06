#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { stripUndefinedDeep, assertNoUndefinedDeep } from '../src/utils/payload.js';
import { workspaceDefinitions, getDesktopWorkspaces, getMobilePrimaryWorkspaces, getMobileMoreWorkspaces } from '../src/config/workspaces.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const results = [];
function check(name, fn) {
  try { results.push({ name, ok: true, detail: fn() || 'ok' }); }
  catch (err) { results.push({ name, ok: false, detail: err.message }); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const sourceFiles = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
  const rel = path.join(dir, entry.name);
  if (rel === 'src/test') return [];
  if (entry.isDirectory()) return sourceFiles(rel);
  return /\.(js|jsx|ts|tsx)$/.test(entry.name) ? [rel] : [];
});
const srcText = sourceFiles('src').map(read).join('\n');
const apiSrc = read('src/api.js');
const macroSrc = read('src/workspaces/MacroWorkspace.jsx');

check('no stale ML champion endpoint remains in production source', () => {
  assert(!/\/api\/ml\/champion/.test(srcText), 'found /api/ml/champion');
  assert(!/\/api\/ai\/models\//.test(srcText), 'found /api/ai/models lifecycle route');
});
check('canonical ML lifecycle endpoints are present', () => {
  for (const route of ['/api/ml/model', '/api/ml/model-runs', '/api/ml/feature-importance', '/api/ml/drift', '/api/ml/model-card', '/api/ml/train', '/api/ml/promote/', '/api/ml/infer/']) {
    assert(apiSrc.includes(route), `missing ${route}`);
  }
});
check('historical use-for client endpoints are present', () => {
  for (const route of ['/api/historical/use-for-ml', '/api/historical/use-for-backtest', '/api/historical/use-for-correlation']) assert(apiSrc.includes(route), `missing ${route}`);
});
check('every implemented desktop workspace is mobile accessible', () => {
  const mobile = new Set([...getMobilePrimaryWorkspaces(), ...getMobileMoreWorkspaces()].map((w) => w.id));
  for (const workspace of getDesktopWorkspaces().filter((w) => w.implemented)) assert(mobile.has(workspace.id), `${workspace.id} hidden on mobile`);
});
check('every implemented workspace has a component or safe placeholder key', () => {
  const componentSrc = read('src/config/workspaceComponents.jsx');
  for (const workspace of workspaceDefinitions.filter((w) => w.implemented)) {
    assert(new RegExp(`${workspace.componentKey}\\s*:`).test(componentSrc), `${workspace.id} missing component ${workspace.componentKey}`);
  }
});
check('datasetId undefined is stripped and asserted', () => {
  const payload = stripUndefinedDeep({ symbol: 'SPY', datasetId: undefined, nested: { a: undefined, b: 1 } });
  assert(!('datasetId' in payload), 'datasetId undefined survived');
  assertNoUndefinedDeep(payload);
});
check('training/backtest/correlation payloads include selected dataset guards', () => {
  assert(/selectedMlDatasetId[\s\S]{0,420}datasetId/.test(read('src/store/aiLabStore.js')), 'AI Lab train datasetId guard missing');
  assert(/pendingDatasetId[\s\S]{0,260}datasetId/.test(read('src/store/mlStore.js')), 'ML Dashboard train datasetId guard missing');
  assert(/runBacktest[\s\S]{0,500}datasetId/.test(apiSrc), 'backtest datasetId guard missing');
  assert(/getMultiAssetCorrelation[\s\S]{0,420}datasetId/.test(apiSrc), 'correlation datasetId guard missing');
});
check('Macro renders invalid beta/correlation as em dash, not NaN', () => {
  assert(/finiteNumber/.test(macroSrc), 'finiteNumber guard missing');
  assert(/finiteValue != null \? finiteValue\.toFixed\(2\) : '—'/.test(macroSrc), 'correlation finite render guard missing');
  assert(/const betaVal = finiteNumber\(beta\?\.beta\)/.test(macroSrc), 'beta finite guard missing');
});
check('historical selection store is versioned and persisted safely', () => {
  const src = read('src/store/historicalDataStore.js');
  assert(/persist\(/.test(src) && /version: 2/.test(src), 'historical store persistence missing');
  assert(/selectedMlDatasetId/.test(src) && /selectedBacktestDatasetId/.test(src) && /selectedCorrelationDatasetId/.test(src), 'selected dataset fields missing');
});
check('workspace shell has scoped error boundary', () => {
  assert(/<ErrorBoundary[\s\S]{0,120}key=\{workspace\}[\s\S]{0,160}fallback=/.test(read('src/App.jsx')), 'workspace ErrorBoundary missing');
});
check('websocket is capped, resumable, and listener cleanup is available', () => {
  const ws = read('src/services/wsClient.js');
  assert(/maxReconnectAttempts/.test(ws) && /reconnectNow\(\)/.test(ws), 'WS cap/manual reconnect missing');
  assert(/return \(\) => \{ this\.listeners/.test(ws), 'WS listener cleanup missing');
});

const summary = { ok: results.every((r) => r.ok), generatedAt: new Date().toISOString(), total: results.length, passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
const out = path.join(ROOT, 'FULL_FRONTEND_SMOKE_RESULTS.json');
fs.writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
console.log(`\n${summary.passed}/${summary.total} checks passed → ${path.relative(ROOT, out)}`);
process.exit(summary.ok ? 0 : 1);
