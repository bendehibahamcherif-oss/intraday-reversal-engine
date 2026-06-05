#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const API_BASE = (process.env.API_BASE || 'https://reversal.onrender.com').replace(/\/$/, '');
const OUT = path.join(process.cwd(), 'PRODUCTION_API_SMOKE_RESULTS.json');

const checks = [
  { method: 'GET', endpoint: '/api/ml/health', keys: ['ok', 'status', 'worker'] },
  { method: 'GET', endpoint: '/api/ml/model', keys: ['ok', 'champion', 'challengers', 'status'] },
  { method: 'GET', endpoint: '/api/ml/model-runs?symbol=SPY', keys: ['ok', 'runs', 'symbol', 'status'] },
  { method: 'GET', endpoint: '/api/ml/predictions?limit=100&symbol=SPY', keys: ['ok', 'predictions', 'symbol', 'status'] },
  { method: 'GET', endpoint: '/api/ml/feature-importance', keys: ['ok', 'features', 'status'] },
  { method: 'GET', endpoint: '/api/ml/drift', keys: ['ok', 'drift'] },
  { method: 'GET', endpoint: '/api/ml/model-card', keys: ['ok', 'modelCard', 'status'] },
  { method: 'POST', endpoint: '/api/ml/train', keys: ['ok', 'status', 'message'], body: { symbol: 'SPY', timeframe: '1m', candles: [] } },
  { method: 'POST', endpoint: '/api/ml/infer/SPY', keys: ['ok', 'status', 'message'], body: { timeframe: '1m', featureVector: [0, 0, 0] } },
  { method: 'GET', endpoint: '/api/multi-asset/correlation?window=20&timeframe=1d&symbols=SPY%2CQQQ%2CIWM%2CDIA%2CTLT%2CGLD', keys: ['ok', 'symbols', 'matrix', 'status'] },
  { method: 'GET', endpoint: '/api/multi-asset/beta?symbol=QQQ&benchmark=SPY&window=20&timeframe=1d', keys: ['ok', 'symbol', 'benchmark', 'beta', 'r2', 'status'] },
  { method: 'GET', endpoint: '/api/multi-asset/sector-rotation?window=20&timeframe=1d', keys: ['ok', 'sectors', 'status'] },
  { method: 'GET', endpoint: '/api/multi-asset/volatility?window=20&timeframe=1d&symbols=SPY%2CQQQ%2CIWM%2CDIA%2CTLT%2CGLD', keys: ['ok', 'heatmap', 'status'] },
];

function hasKey(obj, key) {
  return obj && Object.prototype.hasOwnProperty.call(obj, key);
}

async function run() {
  const results = [];
  for (const check of checks) {
    const result = {
      endpoint: check.endpoint,
      method: check.method,
      status: 0,
      contentType: '',
      validJson: false,
      shapeOk: false,
      error: '',
    };
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number(process.env.SMOKE_TIMEOUT_MS || 15000));
      let res;
      try {
        res = await fetch(`${API_BASE}${check.endpoint}`, {
          method: check.method,
          headers: { 'Content-Type': 'application/json' },
          body: check.body ? JSON.stringify(check.body) : undefined,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      result.status = res.status;
      result.contentType = res.headers.get('content-type') || '';
      const text = await res.text();
      if (res.status === 404) result.error = 'HTTP 404';
      if (/html/i.test(result.contentType) || /^\s*</.test(text)) result.error = result.error || 'HTML response';
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
        result.validJson = true;
      } catch {
        result.error = result.error || 'Invalid JSON body';
      }
      const missing = check.keys.filter((key) => !hasKey(body, key));
      result.shapeOk = result.validJson && missing.length === 0;
      if (missing.length) result.error = result.error || `Missing keys: ${missing.join(', ')}`;
      if (res.status >= 500 && check.method === 'GET') result.error = result.error || `HTTP ${res.status}`;
    } catch (error) {
      result.error = error.message || 'fetch failed';
    }
    results.push(result);
  }
  const summary = {
    ok: results.every((r) => r.status !== 404 && !/html/i.test(r.contentType) && r.validJson && r.shapeOk && !r.error),
    apiBase: API_BASE,
    generatedAt: new Date().toISOString(),
    results,
  };
  fs.writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

run();
