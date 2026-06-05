#!/usr/bin/env node
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const PORT = Number(process.env.PLATFORM_SMOKE_PORT || 4111);
const BASE = process.env.PLATFORM_SMOKE_BASE || `http://127.0.0.1:${PORT}`;
const shouldSpawn = !process.env.PLATFORM_SMOKE_BASE;

const checks = [
  ['GET', '/api/ml/health', ['ok', 'status', 'worker']],
  ['GET', '/api/ml/model', ['ok', 'champion', 'challengers', 'status']],
  ['GET', '/api/ml/model-runs', ['ok', 'runs']],
  ['GET', '/api/ml/predictions', ['ok', 'predictions']],
  ['GET', '/api/ml/feature-importance', ['ok', 'features']],
  ['GET', '/api/ml/drift', ['ok', 'drift']],
  ['GET', '/api/ml/model-card', ['ok', 'modelCard', 'status']],
  ['GET', '/api/providers/health', ['success', 'providers', 'activeProviders']],
  ['GET', '/api/providers/credentials', ['success', 'credentials']],
  ['GET', '/api/providers/active', ['success', 'providers', 'activeProviders']],
  ['GET', '/api/feed/status', ['success', 'feedStatus', 'activeProviders']],
  ['GET', '/api/feeds/tick/SPY', ['ok', 'tick', 'symbol', 'source']],
  ['GET', '/api/feeds/candle/SPY', ['ok', 'candle', 'symbol', 'source']],
  ['GET', '/api/feeds/orderbook/SPY', ['ok', 'orderBook', 'symbol', 'source']],
  ['GET', '/api/portfolio/summary', ['ok', 'summary']],
  ['GET', '/api/portfolio/positions', ['ok', 'positions']],
  ['GET', '/api/portfolio/pnl', ['ok', 'pnl']],
  ['GET', '/api/portfolio/exposure', ['ok', 'exposure']],
  ['GET', '/api/portfolio/drawdown', ['ok', 'drawdown']],
  ['GET', '/api/risk/summary', ['ok', 'risk']],
  ['GET', '/api/risk/exposure', ['ok', 'exposure']],
  ['GET', '/api/risk/drawdown', ['ok', 'drawdown']],
];

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitForHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {}
    await wait(250);
  }
  throw new Error('backend did not become healthy before timeout');
}

async function runChecks() {
  const results = [];
  for (const [method, endpoint, keys] of checks) {
    const startedAt = Date.now();
    const result = { method, endpoint, ok: false, status: 0, json: false, missingKeys: [], latencyMs: 0 };
    try {
      const res = await fetch(`${BASE}${endpoint}`, { method });
      result.status = res.status;
      result.latencyMs = Date.now() - startedAt;
      if (res.status === 404) throw new Error('HTTP 404');
      const text = await res.text();
      let body;
      try { body = text ? JSON.parse(text) : null; result.json = true; }
      catch { throw new Error('invalid JSON'); }
      result.missingKeys = keys.filter((key) => !(body && Object.prototype.hasOwnProperty.call(body, key)));
      if (result.missingKeys.length) throw new Error(`missing keys: ${result.missingKeys.join(', ')}`);
      result.ok = true;
    } catch (error) {
      result.error = error.message;
    }
    results.push(result);
  }
  const summary = {
    ok: results.every((r) => r.ok),
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
  fs.writeFileSync(path.join(process.cwd(), 'PLATFORM_SMOKE_RESULTS.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

(async () => {
  let child = null;
  try {
    if (shouldSpawn) {
      child = spawn(process.execPath, ['server/index.cjs'], {
        env: { ...process.env, PORT: String(PORT), MONGO_URI: '', PROVIDER_STATE_FILE: path.join(process.cwd(), 'data', 'platform-smoke-provider-state.json') },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.on('data', (d) => process.stdout.write(d));
      child.stderr.on('data', (d) => process.stderr.write(d));
      child.on('exit', (code) => { if (code !== null && code !== 0 && !process.exitCode) process.exitCode = code; });
      await waitForHealth();
    }
    await runChecks();
  } catch (error) {
    const summary = { ok: false, generatedAt: new Date().toISOString(), baseUrl: BASE, error: error.message, results: [] };
    fs.writeFileSync(path.join(process.cwd(), 'PLATFORM_SMOKE_RESULTS.json'), `${JSON.stringify(summary, null, 2)}\n`);
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (child) child.kill('SIGTERM');
  }
})();
