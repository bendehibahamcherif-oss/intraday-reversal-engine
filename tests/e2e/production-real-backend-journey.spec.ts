/**
 * Production real-backend journey test.
 *
 * Boots the local Vite dev app and intercepts all /api/** requests at the
 * Playwright network layer, forwarding them to the production backend
 * (https://reversal.onrender.com). This bypasses CORS entirely — the browser
 * never makes a direct cross-origin request; Playwright handles the server-side
 * fetch and delivers the response.
 *
 * Only /api/auth/** is kept mocked so the frontend shell can boot with a
 * fake identity. All other API traffic flows to the real backend.
 *
 * Failures: 404 (missing route), 500 (server error), HTML response,
 *           invalid JSON, NaN/Infinity in response, invalid visible text
 *           (undefined, TypeError, NaN, etc.).
 * Accepted: 401/403 (auth-gated routes — route exists but requires real credentials).
 *
 * Run:
 *   npx playwright test tests/e2e/production-real-backend-journey.spec.ts
 *   # or with a custom backend:
 *   VITE_API_BASE=https://reversal.onrender.com npx playwright test tests/e2e/production-real-backend-journey.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import { installAuthState, openDesktopWorkspace } from './helpers/appHarness';
import { invalidTextPatterns, workspaceById } from './helpers/workspaceData';

// Skip this spec unless explicitly opted in — it routes all /api traffic to the production backend.
// Run with: npx playwright test tests/e2e/production-real-backend-journey.spec.ts
//        or: PRODUCTION_CONTRACT=1 ... node scripts/run-production-readiness.js
test.skip(!process.env.PRODUCTION_CONTRACT, 'Set PRODUCTION_CONTRACT=1 to run real-backend journey tests');

const PROD_BACKEND = process.env.VITE_API_BASE || 'https://reversal.onrender.com';
const BAD_URL_TOKENS = /(?:undefined|null|NaN)/i;

export type RealContractEntry = {
  workspace: string;
  method: string;
  url: string;
  prodUrl: string;
  status: number;
  contentType: string;
  validJson: boolean;
  responsePreview: string;
  pass: boolean;
  failureReason?: string;
};

const AUTH_STUB = JSON.stringify({ ok: true, user: { id: 'e2e-user', email: 'e2e@example.com', name: 'E2E User' } });
const AUTH_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

async function installProductionPassthrough(
  page: Page,
  records: RealContractEntry[],
  getWorkspace: () => string,
) {
  // Stub auth routes so the frontend shell boots without real credentials.
  await page.route('**/auth/**', async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (/^\/auth\/(me|check|login|register)/.test(path)) {
      return route.fulfill({ status: 200, headers: AUTH_HEADERS, body: AUTH_STUB });
    }
    return route.continue();
  });

  // Forward all /api/** to the production backend at the node.js level.
  await page.route('**/api/**', async (route: Route) => {
    const req = route.request();
    const originalUrl = new URL(req.url());
    const path = originalUrl.pathname;

    // Stub /api/auth/* so the frontend can initialise session checks.
    if (path.startsWith('/api/auth/')) {
      return route.fulfill({ status: 200, headers: AUTH_HEADERS, body: AUTH_STUB });
    }

    if (BAD_URL_TOKENS.test(path)) {
      records.push({ workspace: getWorkspace(), method: req.method(), url: req.url(), prodUrl: '', status: 0, contentType: '', validJson: false, responsePreview: '', pass: false, failureReason: 'url-contains-bad-token' });
      return route.fulfill({ status: 400, headers: AUTH_HEADERS, body: JSON.stringify({ ok: false, error: 'bad-url-token' }) });
    }

    const prodUrl = `${PROD_BACKEND}${path}${originalUrl.search}`;
    let status = 0;
    let contentType = '';
    let responsePreview = '';
    let validJson = false;
    let failureReason = '';

    try {
      // route.fetch() makes a server-side (node.js) request — no CORS restrictions.
      const response = await route.fetch({
        url: prodUrl,
        headers: {
          ...req.headers(),
          // Use an origin in the production CORS whitelist.
          origin: 'http://localhost:5173',
          referer: 'http://localhost:5173/',
        },
        timeout: 30000,
      });

      status = response.status();
      contentType = response.headers()['content-type'] || '';
      const body = await response.text();
      responsePreview = body.slice(0, 300);

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
        try {
          const parsed = JSON.parse(body);
          validJson = true;
          if (/\b(?:NaN|Infinity)\b/.test(JSON.stringify(parsed))) {
            failureReason = 'response-contains-nan-infinity';
          }
        } catch {
          // Some routes legitimately return non-JSON (e.g., binary/stream) — only flag if content-type says json
          if (/json/i.test(contentType)) failureReason = 'invalid-json-body';
        }
      }

      await route.fulfill({ response });
    } catch (err) {
      failureReason = `passthrough-failed: ${String(err).slice(0, 200)}`;
      await route.fulfill({
        status: 503,
        headers: AUTH_HEADERS,
        body: JSON.stringify({ ok: false, error: 'production-unreachable', message: String(err) }),
      });
    }

    records.push({
      workspace: getWorkspace(),
      method: req.method(),
      url: req.url(),
      prodUrl,
      status,
      contentType,
      validJson,
      responsePreview,
      pass: !failureReason,
      ...(failureReason ? { failureReason } : {}),
    });
  });
}

// Journey workspace IDs — canonical entries only (duplicates have been merged into tabs).
// 'Providers' navigates to LiveData workspace starting on the providers tab.
// Removed from journey: Credentials, StreamStatus, ProviderDiagnostics, MLModelCard,
//   MLTrainingRuns, MLPredictions, MLDiagnosticsDrift, MLChampionInference,
//   VolumeProfile, Correlation, Beta, StrategyBuilder, Settings, Macro.
const journeyWorkspaceIds = [
  'ChartOrderflow',
  'LiveData',
  'Providers',
  'HistoricalData',
  'AILab',
  'MLEngine',
  'Backtesting',
  'MacroMultiAsset',
  'Portfolio',
  'Risk',
  'Ops',
];

test('production real-backend journey: visit major workspaces with live production API — no 404, no 500, no invalid text', async ({ page }) => {
  const records: RealContractEntry[] = [];
  let currentWorkspace = 'boot';
  const consoleErrors: string[] = [];
  const pageExceptions: string[] = [];

  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => pageExceptions.push(err.message));

  await installAuthState(page);
  await installProductionPassthrough(page, records, () => currentWorkspace);

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  try {
    await expect(page.getByTestId('terminal-shell')).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByTestId('desktop-workspace-nav').or(page.getByTestId('mobile-workspace-nav')),
    ).toBeVisible({ timeout: 10000 });
  } catch (err) {
    const bodyText = await page.locator('body').innerText().catch(() => '(unavailable)');
    throw new Error(`App shell failed to boot.\nBody text:\n${bodyText.slice(0, 2000)}\nOriginal error: ${err}`);
  }

  // Allow boot-time API calls to settle
  await page.waitForTimeout(2000);
  currentWorkspace = 'boot';

  const screenSanityFailures: Array<{ workspace: string; invalidText: string[]; invalidSvgAttrs: string[] }> = [];

  for (const workspaceId of journeyWorkspaceIds) {
    const workspace = workspaceById(workspaceId);
    if (!workspace) {
      console.warn(`[journey] workspace ${workspaceId} not found in registry — skipping`);
      continue;
    }
    currentWorkspace = workspace.id;

    await openDesktopWorkspace(page, workspace);

    // Wait for workspace-specific API calls to complete
    await page.waitForTimeout(2000);

    // Screen sanity
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const invalidText = invalidTextPatterns.filter((p) => p.test(bodyText)).map(String);
    const invalidSvgAttrs = await page.locator('svg *').evaluateAll((nodes) => {
      const bad: string[] = [];
      for (const node of nodes) {
        for (const attr of Array.from(node.attributes || [])) {
          if (/\b(?:NaN|Infinity|undefined)\b/i.test(attr.value)) {
            bad.push(`${node.tagName}.${attr.name}=${attr.value}`);
          }
        }
      }
      return bad;
    }).catch(() => [] as string[]);

    if (invalidText.length || invalidSvgAttrs.length) {
      screenSanityFailures.push({ workspace: workspace.id, invalidText, invalidSvgAttrs });
    }

    expect(invalidText, `${workspace.label}: invalid visible text — patterns: ${invalidText.join(', ')}`).toEqual([]);
    expect(invalidSvgAttrs, `${workspace.label}: invalid SVG/chart attributes`).toEqual([]);
  }

  const contractFailures = records.filter((r) => !r.pass);
  const summary = {
    generatedAt: new Date().toISOString(),
    backend: PROD_BACKEND,
    total: records.length,
    passed: records.filter((r) => r.pass).length,
    failed: contractFailures.length,
    authRequired: records.filter((r) => r.status === 401 || r.status === 403).length,
    consoleErrors,
    pageExceptions,
    screenSanityFailures,
    records,
  };
  fs.writeFileSync('PRODUCTION_REAL_BACKEND_JOURNEY_RESULTS.json', JSON.stringify(summary, null, 2));
  console.log(`\n[journey] ${summary.passed}/${summary.total} API calls passed (${summary.authRequired} auth-gated, ${summary.failed} failed)`);

  expect(
    contractFailures,
    `Production real-backend contract failures:\n${JSON.stringify(contractFailures, null, 2)}`,
  ).toEqual([]);

  expect(
    pageExceptions,
    `Production journey page exceptions:\n${pageExceptions.join('\n')}`,
  ).toEqual([]);
});
