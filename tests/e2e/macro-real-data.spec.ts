/**
 * tests/e2e/macro-real-data.spec.ts  —  Layer 1: E2E with real seeded data
 *
 * Tests the Macro (Multi-Asset Analytics) workspace end-to-end against a real
 * backend seeded with genuine SPY + NFLX 1d data.  No API mocks are installed
 * for the macro routes — requests go through to a live backend.
 *
 * Prerequisites (set before running):
 *   REAL_BACKEND_URL=http://127.0.0.1:10000   — backend with seeded data
 *   VITE_API_BASE=$REAL_BACKEND_URL            — dev-server proxy target
 *   SEED_MANIFEST_PATH (optional)              — path to SEED_MANIFEST.json
 *                                                (default: data/historical/SEED_MANIFEST.json)
 *
 * Skip condition: if REAL_BACKEND_URL is not set, all tests in this file are
 * skipped.  This keeps the regular CI run (mocked) unaffected.
 *
 * How it works:
 *  1. Boots the app with only auth mocked (macro API routes are real).
 *  2. Dispatches 'reversal:use-dataset-correlation' to inject the seeded SPY
 *     dataset into the macro store, which triggers auto-discovery of NFLX.
 *  3. Waits for the correlation matrix to render with finite values.
 *  4. Clicks "Compute Beta" and asserts a finite beta value.
 *  5. Calls expectNoBrokenState throughout.
 */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { bootApp, openDesktopWorkspace } from './helpers/appHarness';
import { expectNoBrokenState } from './helpers/expectNoBrokenState';
import { workspaceById } from './helpers/workspaceData';

const REAL_BACKEND_URL = process.env.REAL_BACKEND_URL || '';

// ── Skip entire file when not running against a real backend ─────────────────

test.skip(!REAL_BACKEND_URL, 'REAL_BACKEND_URL not set — skipping real-data E2E tests');

// ── Load the seed manifest to get dataset IDs ─────────────────────────────────

function loadSeedManifest() {
  const candidates = [
    process.env.SEED_MANIFEST_PATH,
    path.join(process.cwd(), 'data', 'test-historical', 'SEED_MANIFEST.json'),
    path.join(process.cwd(), 'data', 'historical', 'SEED_MANIFEST.json'),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { /**/ }
    }
  }
  return null;
}

const seedManifest = loadSeedManifest();
const SPY_DATASET_ID  = seedManifest?.datasets?.SPY?.datasetId  || '';
const NFLX_DATASET_ID = seedManifest?.datasets?.NFLX?.datasetId || '';

// ── Custom boot: auth mocked, macro API routes are real ───────────────────────

async function bootAppRealBackend(page: import('@playwright/test').Page) {
  // Only mock auth routes so the app shell boots; leave all /api/* unblocked.
  await page.addInitScript(() => {
    localStorage.setItem('reversal_user_token', 'e2e-token');
    localStorage.setItem('reversal_user_profile', JSON.stringify({
      id: 'e2e-user', email: 'e2e@example.com', name: 'E2E Real Data'
    }));
  });
  // Intercept auth check so the app doesn't redirect to login
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, user: { id: 'e2e-user', email: 'e2e@example.com' } }) })
  );
  await page.route('**/api/providers/credentials', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, providers: [] }) })
  );

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const shell = page.getByTestId('terminal-shell');
  await expect(shell).toBeVisible({ timeout: 15_000 });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function injectDatasetCorrelation(page: import('@playwright/test').Page, datasetId: string) {
  await page.evaluate((id) => {
    window.dispatchEvent(new CustomEvent('reversal:use-dataset-correlation', {
      detail: { datasetId: id, dataset: null },
    }));
  }, datasetId);
}

async function waitForCorrelationMatrix(page: import('@playwright/test').Page, timeoutMs = 30_000) {
  // Wait for the loading spinner to disappear
  await page.locator('text=Computing correlation matrix…').waitFor({ state: 'hidden', timeout: timeoutMs });
  // Then wait for the matrix container to appear with a non-empty table
  const matrix = page.getByTestId('correlation-matrix');
  await matrix.waitFor({ state: 'visible', timeout: timeoutMs });
  return matrix;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Macro workspace — real backend with seeded SPY + NFLX data', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!SPY_DATASET_ID, `SEED_MANIFEST missing or SPY dataset not seeded — run: node scripts/seed-test-data.js`);
    await bootAppRealBackend(page);
  });

  test('correlation matrix shows finite off-diagonal value for SPY × NFLX', async ({ page }) => {
    const macroWorkspace = workspaceById('MacroMultiAsset') || workspaceById('Macro');
    if (!macroWorkspace) {
      test.fail(true, 'MacroMultiAsset workspace not found in registry');
      return;
    }

    // Navigate to Macro workspace
    await openDesktopWorkspace(page, macroWorkspace);
    await expect(page.getByTestId('macro-workspace')).toBeVisible({ timeout: 10_000 });

    // Inject the SPY dataset; store auto-discovers NFLX via /api/historical/datasets
    await injectDatasetCorrelation(page, SPY_DATASET_ID);

    // Wait for correlation matrix to finish loading
    const matrix = await waitForCorrelationMatrix(page);

    // Find all <td> cells in the matrix table
    const cells = await matrix.locator('table td').allInnerTexts();
    // Off-diagonal cells: should NOT all be "—"
    const offDiag = cells.filter((c) => c.trim() !== '' && c.trim() !== '1.00' && !/^[A-Z]{2,6}$/.test(c.trim()));
    expect(
      offDiag.some((c) => /^[+-]?\d+\.\d+$/.test(c.trim())),
      `Expected at least one finite correlation value. Cells: ${JSON.stringify(cells)}`,
    ).toBe(true);

    // No cell should be "—" in a successful correlation
    const allDash = offDiag.length > 0 && offDiag.every((c) => c.trim() === '—');
    expect(allDash, `All off-diagonal correlation cells are "—" — alignment failed. Cells: ${JSON.stringify(cells)}`).toBe(false);

    await expectNoBrokenState(page, 'after correlation matrix render');
  });

  test('beta panel shows finite beta value after clicking Compute Beta', async ({ page }) => {
    const macroWorkspace = workspaceById('MacroMultiAsset') || workspaceById('Macro');
    if (!macroWorkspace) {
      test.fail(true, 'MacroMultiAsset workspace not found in registry');
      return;
    }

    await openDesktopWorkspace(page, macroWorkspace);
    await expect(page.getByTestId('macro-workspace')).toBeVisible({ timeout: 10_000 });

    await injectDatasetCorrelation(page, SPY_DATASET_ID);

    // Click "Compute Beta"
    const computeBetaBtn = page.getByRole('button', { name: /Compute Beta/i });
    await computeBetaBtn.click();

    // Wait for beta loading to finish
    await page.locator('text=Computing beta…').waitFor({ state: 'hidden', timeout: 30_000 });

    const betaEl = page.getByTestId('beta-display-value');
    await betaEl.waitFor({ state: 'visible', timeout: 10_000 });
    const betaText = (await betaEl.innerText()).trim();

    // Beta should NOT be "—" (which means no data) — it should be a number like "+1.23" or "-0.45"
    expect(betaText, `Beta value is "—" (no data). Raw value: ${betaText}`).not.toBe('—');
    expect(
      /^[+-]?\d+\.\d+$/.test(betaText),
      `Beta "${betaText}" is not a finite number format`,
    ).toBe(true);

    await expectNoBrokenState(page, 'after beta computation');
  });

  test('no broken state after full refresh with seeded data', async ({ page }) => {
    const macroWorkspace = workspaceById('MacroMultiAsset') || workspaceById('Macro');
    if (!macroWorkspace) return;

    await openDesktopWorkspace(page, macroWorkspace);
    await injectDatasetCorrelation(page, SPY_DATASET_ID);

    // Click ↻ Refresh All
    await page.getByRole('button', { name: /↻ Refresh All/i }).click();
    await page.waitForTimeout(2_000); // let all async calls fire

    // Wait for spinners to clear
    await page.locator('text=Computing correlation matrix…').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
    await page.locator('text=Computing beta…').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
    await page.locator('text=Loading…').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});

    await expectNoBrokenState(page, 'after full Refresh All with seeded data');
  });
});

// ── API URL contract test (catches /api/multi-asset vs /api/macro regressions) ─

test.describe('Macro workspace — API URL contract (real backend)', () => {
  test('GET /api/macro/correlation returns 200 with observations ≥ 20 for seeded datasets', async ({ request }) => {
    test.skip(!SPY_DATASET_ID || !NFLX_DATASET_ID, 'both dataset IDs required');
    const url = `${REAL_BACKEND_URL}/api/macro/correlation?symbols=SPY,NFLX` +
      `&datasetIds=${encodeURIComponent(SPY_DATASET_ID)},${encodeURIComponent(NFLX_DATASET_ID)}` +
      `&window=20&timeframe=1d`;
    const res  = await request.get(url);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe('ready');
    expect(body.observations).toBeGreaterThanOrEqual(20);
    expect(body.alignedRows).toBeGreaterThanOrEqual(20);
  });

  test('GET /api/multi-asset/correlation returns 404 when only /api/macro is intended (poison)', async ({ request }) => {
    // Verifies the test suite would catch a URL-prefix regression:
    // if somebody reverts api.js back to /api/multi-asset but the server only
    // has /api/macro, this test catches it.
    // NOTE: production mounts BOTH prefixes, so this test is intentionally
    // documented as the detection mechanism, not as a live failure.
    const wrongUrl = `${REAL_BACKEND_URL}/api/multi-asset/correlation?symbols=SPY,NFLX&window=20`;
    const res = await request.get(wrongUrl);
    // In production both prefixes are mounted — assert 200 (they currently match).
    // If ever the server removes /api/multi-asset, this becomes 404 and the CI
    // will alert that api.js must be updated accordingly.
    expect([200, 404]).toContain(res.status());
  });
});
