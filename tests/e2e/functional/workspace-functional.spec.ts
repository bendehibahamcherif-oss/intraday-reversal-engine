/**
 * tests/e2e/functional/workspace-functional.spec.ts  —  Layer 1: Functional coverage
 *
 * Auto-discovers ALL UI modules from src/config/workspaces.js (not a hardcoded list).
 * One describe block per module; each runs desktop + mobile.
 *
 * Canonical assertion pattern:
 *   navigate → wait for workspace-panel[data-workspace-id] → canonical check → expectScreenSane
 *
 * Anti-false-green:
 *   • A missing workspace-panel testid → FAIL (not skip)
 *   • Crash fallback text visible → FAIL
 *   • expectScreenSane catches NaN / Infinity / SVG corruption
 *   • Poison test: any call to /api/multi-asset/* during Macro navigation → FAIL
 *
 * Why expectScreenSane (not expectNoBrokenState) for mocked tests:
 *   The mocked macro API returns status:'not_enough_data' which the UI may echo
 *   as "Not enough data" — a valid empty-state, not a regression.
 *   expectNoBrokenState is used in macro-real-data.spec.ts against real seeded data.
 */

import { test, expect, type Page } from '@playwright/test';
import { workspaceDefinitions } from '../../../src/config/workspaces.js';
import {
  bootApp,
  openDesktopWorkspace,
  openMobileWorkspace,
  expectScreenSane,
} from '../helpers/appHarness';

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const SETTLE_MS = 1_500;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertWorkspacePanelVisible(page: Page, workspaceId: string) {
  await expect(
    page.locator(`[data-testid="workspace-panel"][data-workspace-id="${workspaceId}"]`),
    `workspace-panel[data-workspace-id="${workspaceId}"] must be visible — was the workspace-panel wrapper added in App.jsx?`,
  ).toBeVisible({ timeout: 10_000 });
}

async function assertNoCrashFallback(page: Page, workspaceId: string) {
  const crashText = await page.locator('body').innerText().catch(() => '');
  expect(
    crashText.includes('hit an error') && crashText.includes('workspace failed to render'),
    `WorkspaceCrashFallback rendered for ${workspaceId} — component threw during render`,
  ).toBe(false);
}

// ── Canonical per-workspace assertions (mocked API, assert real rendered output) ─

type AssertFn = (page: Page) => Promise<void>;

const CANONICAL: Record<string, AssertFn> = {
  ChartOrderflow: async (page) => {
    // Chart renders SVG candles from the mocked chartPayload (30 candles)
    await expect(
      page.locator('svg').first(),
      'ChartOrderflow: SVG chart element must render',
    ).toBeVisible({ timeout: 8_000 });
  },

  MacroMultiAsset: async (page) => {
    // Macro workspace renders its root section with data-testid
    await expect(
      page.getByTestId('macro-workspace'),
      'MacroMultiAsset: macro-workspace testid must be present',
    ).toBeVisible({ timeout: 8_000 });
  },

  HistoricalData: async (page) => {
    // HistoricalData renders dataset-list-panel (has testid already)
    // Mock returns a dataset with datasetId 'e2e-dataset' — assert list panel visible
    await expect(
      page.getByTestId('historical-data-workspace'),
      'HistoricalData: historical-data-workspace testid must be visible',
    ).toBeVisible({ timeout: 8_000 });
    await expect(
      page.getByTestId('dataset-list-panel'),
      'HistoricalData: dataset-list-panel must be visible',
    ).toBeVisible({ timeout: 8_000 });
  },

  Alerts: async (page) => {
    // Alerts workspace renders the alert manager panel
    await expect(
      page.locator(':text("Alerts"), :text("Active Alerts"), :text("Create Alert"), button[aria-label*="lert"]').first(),
      'Alerts: alert panel heading or create button must be visible',
    ).toBeVisible({ timeout: 8_000 });
  },

  Portfolio: async (page) => {
    // Portfolio renders equity/P&L chips. Mock returns equity: 0.
    await expect(
      page.locator(':text("Equity"), :text("Portfolio"), :text("P&L"), :text("PAPER"), :text("LIVE")').first(),
      'Portfolio: portfolio summary section must be visible',
    ).toBeVisible({ timeout: 8_000 });
  },

  Risk: async (page) => {
    // Risk workspace renders VaR and risk summary
    await expect(
      page.locator(':text("VaR"), :text("Risk"), :text("Drawdown")').first(),
      'Risk: risk panel heading must be visible',
    ).toBeVisible({ timeout: 8_000 });
  },

  MLEngine: async (page) => {
    // MLEngine renders ML dashboard — mock returns no_model status
    await expect(
      page.locator(':text("ML"), :text("Model"), :text("Champion"), :text("Train")').first(),
      'MLEngine: ML dashboard panel must be visible',
    ).toBeVisible({ timeout: 8_000 });
  },

  AILab: async (page) => {
    // AILab renders signal panel + diagnostics
    await expect(
      page.locator(':text("AI"), :text("Signal"), :text("Champion"), :text("Inference")').first(),
      'AILab: AI Lab panel must be visible',
    ).toBeVisible({ timeout: 8_000 });
  },

  LiveData: async (page) => {
    // LiveData renders feed status section
    await expect(
      page.locator(':text("Live"), :text("Feed"), :text("Stream"), :text("Status")').first(),
      'LiveData: feed status section must be visible',
    ).toBeVisible({ timeout: 8_000 });
  },

  Providers: async (page) => {
    // Providers uses LiveData component — renders provider/credential section
    await expect(
      page.locator(':text("Provider"), :text("Credentials"), :text("Health"), :text("Live")').first(),
      'Providers: provider panel section must be visible',
    ).toBeVisible({ timeout: 8_000 });
  },

  Execution: async (page) => {
    await expect(
      page.locator(':text("Execution"), :text("Signal"), :text("Quant"), :text("Order")').first(),
      'Execution: execution panel must be visible',
    ).toBeVisible({ timeout: 8_000 });
  },

  Backtesting: async (page) => {
    await expect(
      page.locator(':text("Backtest"), :text("Strategy"), :text("Run"), :text("Simulation")').first(),
      'Backtesting: backtest panel must be visible',
    ).toBeVisible({ timeout: 8_000 });
  },

  PaperTrading: async (page) => {
    await expect(
      page.locator(':text("Paper"), :text("Trade"), :text("Account"), :text("Order")').first(),
      'PaperTrading: paper trading panel must be visible',
    ).toBeVisible({ timeout: 8_000 });
  },

  StrategyLab: async (page) => {
    await expect(
      page.locator(':text("Strategy"), :text("Lab"), :text("Template")').first(),
      'StrategyLab: strategy lab panel must be visible',
    ).toBeVisible({ timeout: 8_000 });
  },

  QuantLab: async (page) => {
    await expect(
      page.locator(':text("Quant"), :text("Lab"), :text("Signal"), :text("Reversal")').first(),
      'QuantLab: quant lab panel must be visible',
    ).toBeVisible({ timeout: 8_000 });
  },

  Replay: async (page) => {
    await expect(
      page.locator(':text("Replay"), :text("Playback"), :text("Speed"), :text("Session")').first(),
      'Replay: replay controls must be visible',
    ).toBeVisible({ timeout: 8_000 });
  },

  OMS: async (page) => {
    await expect(
      page.locator(':text("OMS"), :text("Order"), :text("Management"), :text("Fill")').first(),
      'OMS: OMS panel must be visible',
    ).toBeVisible({ timeout: 8_000 });
  },

  Institutional: async (page) => {
    await expect(
      page.locator(':text("Institutional"), :text("Block"), :text("Dark Pool"), :text("Flow")').first(),
      'Institutional: institutional panel must be visible',
    ).toBeVisible({ timeout: 8_000 });
  },

  Ops: async (page) => {
    await expect(
      page.locator(':text("Ops"), :text("Operations"), :text("Health"), :text("System"), :text("Settings")').first(),
      'Ops: ops/settings panel must be visible',
    ).toBeVisible({ timeout: 8_000 });
  },
};

// ── Auto-discovered workspaces from registry ──────────────────────────────────

const allWorkspaces = workspaceDefinitions.filter((w) => w.implemented);

// ── Per-module test suites ────────────────────────────────────────────────────

for (const workspace of allWorkspaces) {
  test.describe(`[${workspace.id}] ${workspace.label}`, () => {

    // ── Desktop ──────────────────────────────────────────────────────────────
    if (workspace.desktopVisible) {
      test('desktop: navigates and renders without broken state', async ({ page }) => {
        await bootApp(page);
        await openDesktopWorkspace(page, workspace);
        await page.waitForTimeout(SETTLE_MS);

        // Anti-false-green: workspace panel MUST be in the DOM
        await assertWorkspacePanelVisible(page, workspace.id);
        await assertNoCrashFallback(page, workspace.id);

        // Canonical output assertion
        const canonicalAssert = CANONICAL[workspace.id];
        if (canonicalAssert) await canonicalAssert(page);

        await expectScreenSane(page);
      });
    }

    // ── Mobile ────────────────────────────────────────────────────────────────
    if (workspace.mobileVisible) {
      test.describe('mobile', () => {
        test.use({ viewport: MOBILE_VIEWPORT });

        test('mobile: navigates and renders without broken state', async ({ page }) => {
          await bootApp(page);
          await openMobileWorkspace(page, workspace);
          await page.waitForTimeout(SETTLE_MS);

          await assertWorkspacePanelVisible(page, workspace.id);
          await assertNoCrashFallback(page, workspace.id);

          const canonicalAssert = CANONICAL[workspace.id];
          if (canonicalAssert) await canonicalAssert(page);

          await expectScreenSane(page);
        });
      });
    }

  });
}

// ── Poison test: proves suite catches /api/multi-asset vs /api/macro regression ─
//
// This is the E2E equivalent of the api-coverage poison test.
// If someone reverts src/api.js to call /api/multi-asset/correlation instead of
// /api/macro/correlation, this test goes RED.

test.describe('[POISON] Macro API URL contract — regression detection', () => {
  test('Macro workspace must call /api/macro/* — not /api/multi-asset/*', async ({ page }) => {
    const wrongUrls: string[] = [];

    // Record any request to the wrong prefix (before mocks so we catch intercepted requests too)
    page.on('request', (req) => {
      if (/\/api\/multi-asset\//.test(req.url())) {
        wrongUrls.push(req.url());
      }
    });

    await bootApp(page);

    // Override the generic macro mock with one that returns valid correlation data
    // (registered after bootApp so it takes LIFO priority over the **/api/** handler)
    await page.route('**/api/macro/correlation**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          status: 'ready',
          observations: 25,
          alignedRows: 25,
          matrix: [
            { symbol: 'SPY', SPY: 1.0, NFLX: 0.72 },
            { symbol: 'NFLX', SPY: 0.72, NFLX: 1.0 },
          ],
        }),
      });
    });

    const macroWorkspace = allWorkspaces.find((w) => w.id === 'MacroMultiAsset');
    if (!macroWorkspace) throw new Error('MacroMultiAsset not found in workspace registry');

    await openDesktopWorkspace(page, macroWorkspace);
    await expect(page.getByTestId('macro-workspace')).toBeVisible({ timeout: 10_000 });

    // Inject a dataset ID to trigger an API fetch
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('reversal:use-dataset-correlation', {
        detail: { datasetId: 'e2e-poison-spy', dataset: null },
      }));
    });
    await page.waitForTimeout(1_500);

    expect(
      wrongUrls,
      `POISON: /api/multi-asset/* was called — URL prefix regression in src/api.js!\nCalled: ${wrongUrls.join(', ')}`,
    ).toEqual([]);

    await expectScreenSane(page);
  });
});
