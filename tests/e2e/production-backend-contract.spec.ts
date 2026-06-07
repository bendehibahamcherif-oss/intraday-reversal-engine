/**
 * Production backend contract verification.
 *
 * Uses Playwright's request fixture to make direct HTTP calls (node.js level, no
 * browser, no CORS) to the production backend. Every known frontend API route is
 * exercised. Auth state is sent via X-User-Token so the backend can gate
 * auth-required routes with 401 (which is acceptable — route exists).
 *
 * Failures (hard): 404 (route missing), 500 (backend error), HTML response,
 *                  invalid JSON body, empty 200 body, URL with undefined/null/NaN,
 *                  NaN/Infinity in response body.
 * Accepted:        401, 403 (route exists but requires real auth).
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=https://reversal.onrender.com \
 *   npx playwright test tests/e2e/production-backend-contract.spec.ts
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const PROD = process.env.VITE_API_BASE || 'https://reversal.onrender.com';
const BAD_URL_TOKENS = /(?:undefined|null|NaN)/i;

// Skip this spec unless explicitly opted in — it makes real requests to the production backend.
// Run with: PLAYWRIGHT_BASE_URL=https://reversal.onrender.com npx playwright test tests/e2e/production-backend-contract.spec.ts
test.skip(!process.env.PRODUCTION_CONTRACT, 'Set PRODUCTION_CONTRACT=1 to run real-backend contract tests');

export type ContractEntry = {
  workspace: string;
  method: string;
  url: string;
  status: number;
  contentType: string;
  validJson: boolean;
  responsePreview: string;
  requestBodyPreview: string;
  pass: boolean;
  failureReason?: string;
};

const routes: Array<{ method: string; path: string; workspace: string }> = [
  // System / health
  { method: 'GET', path: '/api/runtime/health', workspace: 'System' },
  // Auth — the frontend calls /auth/me (no /api/ prefix)
  { method: 'GET', path: '/auth/me', workspace: 'Auth' },
  // Providers
  { method: 'GET', path: '/api/providers/health', workspace: 'Providers' },
  { method: 'GET', path: '/api/providers/credentials', workspace: 'Credentials' },
  { method: 'GET', path: '/api/providers/active', workspace: 'Providers' },
  // Chart / feeds
  { method: 'GET', path: '/api/feeds/tick/SPY', workspace: 'Chart' },
  { method: 'GET', path: '/api/feeds/candle/SPY', workspace: 'Chart' },
  { method: 'GET', path: '/api/feeds/orderbook/SPY', workspace: 'LiveData' },
  { method: 'GET', path: '/api/feeds/status', workspace: 'LiveData' },
  { method: 'GET', path: '/api/chart/payload/SPY', workspace: 'Chart' },
  { method: 'GET', path: '/api/chart/cvd/SPY', workspace: 'Chart' },
  { method: 'GET', path: '/api/volume-profile/SPY', workspace: 'Chart' },
  // Historical data
  { method: 'GET', path: '/api/historical/providers', workspace: 'HistoricalData' },
  { method: 'GET', path: '/api/historical/datasets', workspace: 'HistoricalData' },
  // ML / AI Lab
  { method: 'GET', path: '/api/ml/dependencies', workspace: 'AILab' },
  { method: 'GET', path: '/api/ml/model', workspace: 'AILab' },
  { method: 'GET', path: '/api/ml/model-runs', workspace: 'AILab' },
  { method: 'GET', path: '/api/ml/health', workspace: 'AILab' },
  { method: 'GET', path: '/api/ml/worker/status', workspace: 'AILab' },
  { method: 'GET', path: '/api/ml/signal/SPY', workspace: 'AILab' },
  { method: 'GET', path: '/api/ml/drift', workspace: 'AILab' },
  { method: 'GET', path: '/api/ml/feature-importance', workspace: 'AILab' },
  { method: 'GET', path: '/api/ml/metrics', workspace: 'AILab' },
  // Alerts
  { method: 'GET', path: '/api/alerts', workspace: 'Alerts' },
  { method: 'GET', path: '/api/alerts/diagnostics', workspace: 'Alerts' },
  { method: 'GET', path: '/api/alerts/history', workspace: 'Alerts' },
  // Backtest
  { method: 'GET', path: '/api/backtest/runs', workspace: 'Backtesting' },
  // Macro / multi-asset
  { method: 'GET', path: '/api/macro/beta', workspace: 'MacroMultiAsset' },
  { method: 'GET', path: '/api/macro/correlation', workspace: 'MacroMultiAsset' },
  { method: 'GET', path: '/api/macro/sector-rotation', workspace: 'MacroMultiAsset' },
  { method: 'GET', path: '/api/macro/volatility-heatmap', workspace: 'MacroMultiAsset' },
  { method: 'GET', path: '/api/multi-asset/beta', workspace: 'MacroMultiAsset' },
  { method: 'GET', path: '/api/multi-asset/correlation', workspace: 'MacroMultiAsset' },
  // Portfolio
  { method: 'GET', path: '/api/portfolio/summary', workspace: 'Portfolio' },
  { method: 'GET', path: '/api/portfolio/positions', workspace: 'Portfolio' },
  { method: 'GET', path: '/api/portfolio/pnl', workspace: 'Portfolio' },
  { method: 'GET', path: '/api/portfolio/exposure', workspace: 'Portfolio' },
  { method: 'GET', path: '/api/portfolio/drawdown', workspace: 'Portfolio' },
  { method: 'GET', path: '/api/portfolio/history', workspace: 'Portfolio' },
  // Risk
  { method: 'GET', path: '/api/risk/summary', workspace: 'Risk' },
  { method: 'GET', path: '/api/risk/limits', workspace: 'Risk' },
  { method: 'GET', path: '/api/risk/var', workspace: 'Risk' },
  { method: 'GET', path: '/api/risk/drawdown', workspace: 'Risk' },
  { method: 'GET', path: '/api/risk/exposure', workspace: 'Risk' },
  { method: 'GET', path: '/api/risk/alerts', workspace: 'Risk' },
  // Ops / institutional / OMS / market
  { method: 'GET', path: '/api/ops/status', workspace: 'Ops' },           // known backend 404 — see BACKEND_FIX_REQUIRED_FROM_FRONTEND_CONTRACT.md
  { method: 'GET', path: '/api/institutional/audit', workspace: 'Institutional' },
  { method: 'GET', path: '/api/institutional/scenarios', workspace: 'Institutional' },
  { method: 'GET', path: '/api/oms/orders', workspace: 'OMS' },
  { method: 'GET', path: '/api/market/runtime', workspace: 'Market' },
];

test.use({ baseURL: PROD });

test('production backend contract: every frontend API route returns valid JSON — not 404, not 500, not HTML', async ({ request }) => {
  // Wake up Render free tier backend (may be sleeping — first request can take 30-60s)
  console.log(`[contract] waking backend: ${PROD}/health`);
  const wakeRes = await request.get(`${PROD}/health`, { timeout: 90000, failOnStatusCode: false }).catch(() => null);
  console.log(`[contract] wake status: ${wakeRes?.status() ?? 'unreachable'}`);
  if (!wakeRes || wakeRes.status() !== 200) {
    // Give extra time for cold start
    await new Promise((r) => setTimeout(r, 10000));
    await request.get(`${PROD}/health`, { timeout: 30000, failOnStatusCode: false }).catch(() => null);
  }

  const results: ContractEntry[] = [];
  const failures: ContractEntry[] = [];

  for (const route of routes) {
    const url = `${PROD}${route.path}`;
    let status = 0;
    let contentType = '';
    let responsePreview = '';
    let validJson = false;
    let failureReason = '';

    // URL sanity guard before making request
    if (BAD_URL_TOKENS.test(route.path)) {
      failureReason = 'url-contains-bad-token';
    } else {
      try {
        const method = route.method.toLowerCase() as 'get' | 'post' | 'delete';
        const response = await (request[method] as Function)(url, {
          timeout: 30000,
          headers: {
            Accept: 'application/json',
            'X-User-Token': 'e2e-contract-probe',
          },
          failOnStatusCode: false,
        });

        status = response.status();
        contentType = response.headers()['content-type'] || '';
        const body = await response.text();
        responsePreview = body.slice(0, 500);

        const isHtml = /text\/html/i.test(contentType) || /^\s*<!doctype/i.test(body) || /^\s*<html/i.test(body);
        const isAuthGated = status === 401 || status === 403;

        if (status === 404) {
          failureReason = 'route-not-found-404';
        } else if (status >= 500) {
          failureReason = `server-error-${status}`;
        } else if (isHtml) {
          failureReason = 'html-response-not-json';
        } else if (status === 200 && !body.trim()) {
          failureReason = 'empty-200-body';
        } else if (!isAuthGated && body.trim()) {
          // Validate JSON for non-auth responses with a body
          try {
            const parsed = JSON.parse(body);
            validJson = true;
            const serialized = JSON.stringify(parsed);
            if (/\b(?:NaN|Infinity)\b/.test(serialized)) {
              failureReason = 'response-contains-nan-infinity';
            }
          } catch {
            failureReason = 'invalid-json-body';
          }
        } else if (isAuthGated) {
          // 401/403: route exists and is properly auth-gated — this is a PASS
          validJson = body.trim().startsWith('{') || body.trim().startsWith('[');
        }
      } catch (err) {
        status = 0;
        failureReason = `request-failed: ${String(err).slice(0, 200)}`;
      }
    }

    const pass = !failureReason;
    const entry: ContractEntry = {
      workspace: route.workspace,
      method: route.method,
      url,
      status,
      contentType,
      validJson,
      responsePreview,
      requestBodyPreview: '',
      pass,
      ...(failureReason ? { failureReason } : {}),
    };
    results.push(entry);
    if (!pass) failures.push(entry);
    console.log(`[contract] ${pass ? 'PASS' : 'FAIL'} ${status || '   '} ${route.method} ${route.path}${failureReason ? ` — ${failureReason}` : ''}`);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    backend: PROD,
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    failed: failures.length,
    authRequired: results.filter((r) => r.status === 401 || r.status === 403).length,
    results,
  };
  fs.writeFileSync('PRODUCTION_BACKEND_CONTRACT_RESULTS.json', JSON.stringify(summary, null, 2));
  console.log(`\n[contract] ${summary.passed}/${summary.total} routes passed (${summary.authRequired} auth-gated, ${summary.failed} failed)`);

  expect(
    failures,
    `Production backend contract failures:\n${JSON.stringify(failures, null, 2)}`,
  ).toEqual([]);
});
