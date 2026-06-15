#!/usr/bin/env node
/**
 * scripts/probe-production.js
 * Probes https://reversal.onrender.com for all 10 deferred modules.
 * Uses paths EXACTLY as src/api.js calls them.
 * Writes PRODUCTION_TRIAGE.json with raw status, content-type, body preview.
 */
import fs from 'node:fs';

const BACKEND = 'https://reversal.onrender.com';
const SYMBOL = 'SPY';
// Use a stable test account so re-runs don't create duplicates
const TEST_EMAIL = 'e2e-probe@reversal.test';
const TEST_PASSWORD = 'Probe1234!xyz';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function withRetry(label, fn, maxAttempts = 8, baseMs = 3000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (e) {
      const delay = Math.min(baseMs * Math.pow(2, i), 30000);
      console.log(`  [retry ${i+1}/${maxAttempts}] ${label}: ${e.message} — waiting ${delay}ms`);
      await sleep(delay);
    }
  }
  throw new Error(`${label}: exceeded ${maxAttempts} retries`);
}

async function hit(url, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers, signal: AbortSignal.timeout(60000) };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  const isSPA = ct.includes('text/html') || /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text);
  let json = null;
  if (!isSPA && ct.includes('application/json')) {
    try { json = JSON.parse(text); } catch {}
  }
  return {
    status: res.status,
    ct,
    isSPA,
    preview: text.slice(0, 200),
    json,
    text,
  };
}

function classify(r) {
  if (r.isSPA)           return 'spa_html_fallback';
  if (!r.json)           return 'non_json';
  if (r.status === 404)  return 'route_exists_no_data';  // JSON 404 = mounted route, no data
  if (r.status !== 200)  return `http_${r.status}`;
  // 200 JSON — check if actually empty/stub
  const j = r.json;
  const isEmpty = v => v === null || v === undefined || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
  const dataFields = Object.values(j).filter(v => !isEmpty(v) && typeof v !== 'boolean' && typeof v !== 'string');
  return dataFields.length > 0 ? 'real_json_200' : 'stub_empty';
}

// ── Boot: wake up Render cold start ──────────────────────────────────────────

async function wakeBackend() {
  console.log('[probe] Waking backend (Render cold-start may take ~60s)...');
  return withRetry('health', async () => {
    const r = await hit(`${BACKEND}/health`);
    if (r.status !== 200) throw new Error(`health returned ${r.status}`);
    console.log(`[probe] Backend awake — ${r.preview.slice(0, 80)}`);
    return true;
  }, 10, 3000);
}

// ── Auth: register (idempotent) then login ────────────────────────────────────

async function getToken() {
  // Try login first; if 401 register then login
  let r = await hit(`${BACKEND}/auth/login`, { method: 'POST', body: { email: TEST_EMAIL, password: TEST_PASSWORD } });
  if (r.status === 401 || r.status === 404 || (r.json && r.json.error)) {
    console.log('[auth] Login failed, registering...');
    const reg = await hit(`${BACKEND}/auth/register`, { method: 'POST', body: { email: TEST_EMAIL, password: TEST_PASSWORD } });
    console.log(`[auth] Register → ${reg.status}  ${reg.preview.slice(0, 80)}`);
    r = await hit(`${BACKEND}/auth/login`, { method: 'POST', body: { email: TEST_EMAIL, password: TEST_PASSWORD } });
  }
  const token = r.json?.token || r.json?.data?.token;
  if (!token) throw new Error(`No token in login response: ${r.preview}`);
  console.log(`[auth] Got JWT (${token.slice(0, 20)}...)`);
  return token;
}

// ── Dataset: get real SPY dataset ID ─────────────────────────────────────────

async function getSpyDatasetId(token) {
  const r = await hit(`${BACKEND}/api/historical/datasets`, { token });
  const datasets = r.json?.datasets ?? r.json?.data ?? [];
  const spy = datasets.find(d => (d.symbols ?? [d.symbol]).includes('SPY') || String(d.symbol) === 'SPY');
  const id = spy?.datasetId || spy?.id || '';
  console.log(`[dataset] SPY datasetId=${id || '(none)'} from ${datasets.length} datasets`);
  return id;
}

// ── Probe targets (paths exactly as api.js uses) ──────────────────────────────

function buildTargets(spyId) {
  return [
    // Alerts
    { module: 'Alerts', label: 'getAlerts', method: 'GET', path: `/api/alerts?symbol=${SYMBOL}` },
    { module: 'Alerts', label: 'listAlerts (legacy)', method: 'GET', path: `/alerts?limit=10` },

    // OMS
    { module: 'OMS', label: 'getOMSOrders', method: 'GET', path: `/api/oms/orders?limit=10` },
    { module: 'OMS', label: 'getOMSStats', method: 'GET', path: `/api/oms/stats` },
    { module: 'OMS', label: 'getOMSReconciliation', method: 'GET', path: `/api/oms/reconciliation` },

    // Execution
    { module: 'Execution', label: 'getExecutionOrders', method: 'GET', path: `/api/execution/orders?mode=paper` },
    { module: 'Execution', label: 'getExecutionFills', method: 'GET', path: `/api/execution/fills?mode=paper` },
    { module: 'Execution', label: 'getExecutionAnalytics', method: 'GET', path: `/api/execution/analytics?mode=paper` },
    { module: 'Execution', label: 'preTradeRiskCheck', method: 'POST', path: `/api/execution/risk-check?mode=paper`, body: { symbol: SYMBOL, qty: 1, side: 'buy', price: 500 } },

    // PaperTrading
    { module: 'PaperTrading', label: 'getPaperOrders', method: 'GET', path: `/api/paper/orders` },
    { module: 'PaperTrading', label: 'getPaperFills', method: 'GET', path: `/api/paper/fills` },
    { module: 'PaperTrading', label: 'getPaperPositions', method: 'GET', path: `/api/paper/positions` },
    { module: 'PaperTrading', label: 'getPaperRiskStatus', method: 'GET', path: `/api/paper/risk/status` },

    // StrategyLab
    { module: 'StrategyLab', label: 'getSavedStrategies', method: 'GET', path: `/api/strategy-lab/strategies/${SYMBOL}` },
    { module: 'StrategyLab', label: 'getStrategyTemplates', method: 'GET', path: `/api/templates/strategies` },
    { module: 'StrategyLab', label: 'getStrategyCandidates', method: 'GET', path: `/api/strategies/candidates/${SYMBOL}` },
    { module: 'StrategyLab', label: 'getRuleSets', method: 'GET', path: `/api/rules/sets/${SYMBOL}` },

    // QuantLab
    { module: 'QuantLab', label: 'getQuantFeatures', method: 'GET', path: `/api/quant/features/${SYMBOL}` },
    { module: 'QuantLab', label: 'getAnalysisHistory', method: 'GET', path: `/api/quant/history/${SYMBOL}?limit=10` },
    { module: 'QuantLab', label: 'runQuantPipeline', method: 'POST', path: `/api/quant/pipeline/${SYMBOL}`, body: { timeframe: '1d' } },

    // ChartOrderflow
    { module: 'ChartOrderflow', label: 'yahooChart', method: 'GET', path: `/yahoo/chart/${SYMBOL}?interval=1d&range=3mo` },
    { module: 'ChartOrderflow', label: 'getChartCandles', method: 'GET', path: `/api/chart/candles/${SYMBOL}?timeframe=1d&limit=50` },
    { module: 'ChartOrderflow', label: 'replayLegacyCandles', method: 'GET', path: `/api/replay-legacy/candles/${SYMBOL}?timeframe=1d` },
    { module: 'ChartOrderflow', label: 'getChartPayload', method: 'GET', path: `/api/chart/payload/${SYMBOL}?timeframe=1d&limit=50` },

    // AILab
    { module: 'AILab', label: 'getMLSignal', method: 'GET', path: `/api/ml/signal/${SYMBOL}?timeframe=1d` },
    { module: 'AILab', label: 'getMLFeatures (P1)', method: 'GET', path: `/api/ml/features/${SYMBOL}?timeframe=1d&limit=1` },
    { module: 'AILab', label: 'getCurrentRegime', method: 'GET', path: `/api/ml/regime/${SYMBOL}` },
    { module: 'AILab', label: 'getDatasetAnalytics', method: 'GET', path: `/api/ml/analytics/${SYMBOL}` },
    { module: 'AILab', label: 'mlInfer', method: 'POST', path: `/api/ml/infer/${SYMBOL}`, body: {} },

    // Portfolio
    { module: 'Portfolio', label: 'getPortfolioSummary', method: 'GET', path: `/api/portfolio/summary?mode=paper` },
    { module: 'Portfolio', label: 'getPortfolioPnL', method: 'GET', path: `/api/portfolio/pnl?mode=paper` },
    { module: 'Portfolio', label: 'getPortfolioPositions', method: 'GET', path: `/api/portfolio/positions?mode=paper` },
    { module: 'Portfolio', label: 'getPortfolioExposure', method: 'GET', path: `/api/portfolio/exposure?mode=paper` },
    { module: 'Portfolio', label: 'getPortfolioHistory', method: 'GET', path: `/api/portfolio/history?mode=paper` },

    // Backtesting
    { module: 'Backtesting', label: 'getBacktestResults', method: 'GET', path: `/api/backtest/results/${SYMBOL}` },
    { module: 'Backtesting', label: 'listBacktestRuns', method: 'GET', path: `/api/backtest/runs` },
    ...(spyId ? [{
      module: 'Backtesting', label: 'runBacktest', method: 'POST',
      path: `/api/backtest/run`,
      body: { symbol: SYMBOL, datasetId: spyId, strategyId: 'default', timeframe: '1d', strategy: { type: 'default' } },
    }] : []),
  ];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await wakeBackend();
  const token = await getToken();
  const spyId = await getSpyDatasetId(token);
  const targets = buildTargets(spyId);

  const results = [];
  for (const t of targets) {
    const url = `${BACKEND}${t.path}`;
    process.stdout.write(`[probe] ${t.module}/${t.label} ${t.method} ${t.path} ... `);
    try {
      const r = await withRetry(`${t.module}/${t.label}`, () => hit(url, { method: t.method, token, body: t.body }), 3, 2000);
      const cls = classify(r);
      console.log(`${r.status} ${cls}  ${r.preview.slice(0, 100).replace(/\n/g, ' ')}`);
      results.push({ ...t, status: r.status, ct: r.ct, classification: cls, preview: r.preview.slice(0, 300), isSPA: r.isSPA });
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      results.push({ ...t, status: 0, ct: '', classification: 'network_error', preview: e.message, isSPA: false });
    }
    await sleep(300); // be gentle with the backend
  }

  const output = { generatedAt: new Date().toISOString(), backend: BACKEND, results };
  fs.writeFileSync('PRODUCTION_TRIAGE.json', JSON.stringify(output, null, 2));
  console.log('\n[probe] Done → PRODUCTION_TRIAGE.json');

  // Summary
  const byModule = {};
  for (const r of results) {
    if (!byModule[r.module]) byModule[r.module] = [];
    byModule[r.module].push(r);
  }
  console.log('\n── SUMMARY ─────────────────────────────────────────────────────');
  for (const [mod, rows] of Object.entries(byModule)) {
    const real = rows.filter(r => r.classification === 'real_json_200');
    const stub = rows.filter(r => r.classification === 'stub_empty');
    const noData = rows.filter(r => r.classification === 'route_exists_no_data');
    const spa = rows.filter(r => r.classification === 'spa_html_fallback');
    const verdict = real.length > 0 ? '✅ REAL DATA' : noData.length > 0 ? '⚠ ROUTE/NO DATA' : stub.length > 0 ? '📦 STUB EMPTY' : spa.length === rows.length ? '🚫 SPA FALLBACK' : '❓ MIXED';
    console.log(`  ${mod.padEnd(16)} ${verdict}  (${rows.map(r => `${r.label}:${r.classification}`).join(', ').slice(0, 120)})`);
  }
}

main().catch(e => { console.error('[probe] FATAL:', e); process.exit(1); });
