/**
 * tests/e2e/real-backend/transactional-ui.spec.ts
 *
 * Mission 7 — Transactional UI coverage.
 *
 * For every transactional module:
 *   1. Do an action via the real UI (fill form, click button)
 *   2. Assert that the rendered output shows a real value — not a dash, not empty
 *   3. expectNoBrokenState
 *
 * HARD FAILS (not skips) if REAL_BACKEND_URL is absent — silent skips are
 * intentionally prohibited.
 *
 * Coverage annotations (parsed by scripts/generate-module-coverage.js):
 *   @coverage:covered PaperTrading
 *   @coverage:covered Alerts
 *   @coverage:covered OMS
 *   @coverage:covered Execution
 *   @coverage:covered Portfolio
 *   @coverage:covered Backtesting
 */

import { test, expect, type Page } from '@playwright/test';
import { expectNoBrokenState } from '../helpers/expectNoBrokenState';
import { workspaceById } from '../helpers/workspaceData';

// ── Hard-fail guard ───────────────────────────────────────────────────────────

const REAL_BACKEND_URL = (process.env.REAL_BACKEND_URL || '').replace(/\/$/, '');

if (!REAL_BACKEND_URL) {
  throw new Error(
    '[transactional-ui] REAL_BACKEND_URL is not set.\n' +
    'This spec MUST run against a live backend — it never skips.\n' +
    'Set REAL_BACKEND_URL=https://reversal.onrender.com before running.',
  );
}

// ── Boot helper (same as functional-all-modules) ─────────────────────────────

async function bootAppRealBackend(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('reversal_user_token', 'e2e-token');
    localStorage.setItem('reversal_user_profile', JSON.stringify({
      id: 'e2e-user', email: 'e2e@example.com', name: 'E2E Transactional',
    }));
  });
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
  await expect(page.getByTestId('terminal-shell')).toBeVisible({ timeout: 20_000 });
}

// ── Navigate to a workspace by its registry entry ────────────────────────────

async function goToWorkspace(page: Page, id: string) {
  const ws = workspaceById(id);
  if (!ws) throw new Error(`Unknown workspace id: ${id}`);

  const navId = ws.navTestId ?? `workspace-nav-${id.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
  const navBtn = page.getByTestId(navId);
  if (await navBtn.count()) {
    await navBtn.first().click();
  } else {
    // Fallback: click by aria-label or text
    const label = ws.ariaLabel ?? ws.label;
    await page.getByRole('button', { name: label, exact: true }).first().click();
  }
  await page.waitForTimeout(600);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function assertFiniteText(text: string, label: string) {
  expect(text, `${label}: expected a finite numeric value, got "${text}"`).not.toBe('—');
  expect(text, `${label}: NaN must not appear`).not.toMatch(/NaN/i);
  expect(text, `${label}: Infinity must not appear`).not.toMatch(/Infinity/i);
}

// =============================================================================
// @coverage:covered PaperTrading
// Place paper order via UI → order row appears with finite quantity.
// =============================================================================
test.describe('PaperTrading — place order via UI', () => {
  test('BUY 3 SPY → order row renders with qty=3', async ({ page }) => {
    await bootAppRealBackend(page);
    await goToWorkspace(page, 'PaperTrading');

    // Set symbol
    const symbolInput = page.getByTestId('pt-symbol-input');
    await symbolInput.clear();
    await symbolInput.fill('SPY');
    // blur to commit
    await symbolInput.press('Tab');

    // Set side = BUY
    await page.getByTestId('pt-side-select').selectOption('BUY');

    // Set type = MARKET
    await page.getByTestId('pt-type-select').selectOption('MARKET');

    // Set qty = 3
    const qtyInput = page.getByTestId('pt-qty-input');
    await qtyInput.clear();
    await qtyInput.fill('3');

    // Click Place Paper Order
    await page.getByTestId('pt-place-btn').click();

    // Wait for order row to appear (backend may need a moment)
    await expect(page.getByTestId('pt-order-row').first()).toBeVisible({ timeout: 20_000 });

    // Assert the qty cell shows a finite value (not '—')
    const qtyText = await page.getByTestId('pt-order-qty').first().innerText();
    assertFiniteText(qtyText, 'pt-order-qty');
    // The rendered qty should be 3 (or contain "3")
    expect(qtyText.trim(), 'order qty should be 3').toContain('3');

    await expectNoBrokenState(page, 'PaperTrading');
  });
});

// =============================================================================
// @coverage:covered Alerts
// Create alert via UI → alert item renders in list with correct symbol.
// =============================================================================
test.describe('Alerts — create alert via UI', () => {
  test('create SPY price_above alert → appears in active alerts list', async ({ page }) => {
    await bootAppRealBackend(page);
    await goToWorkspace(page, 'Alerts');

    // Fill symbol
    const symbolInput = page.getByTestId('alerts-symbol-input');
    await symbolInput.clear();
    await symbolInput.fill('SPY');

    // Set type = price_above (which requires threshold)
    await page.getByTestId('alerts-type-select').selectOption('price_above');

    // Fill threshold
    const thresholdInput = page.getByTestId('alerts-threshold-input');
    await expect(thresholdInput).toBeVisible({ timeout: 5_000 });
    await thresholdInput.clear();
    await thresholdInput.fill('100');

    // Click Create Alert
    await page.getByTestId('alerts-create-btn').click();

    // Wait for the alert to appear in the list
    await expect(page.getByTestId('alerts-item').first()).toBeVisible({ timeout: 15_000 });

    // Assert that at least one alert shows SPY
    const symbolTexts = await page.getByTestId('alerts-item-symbol').allInnerTexts();
    expect(
      symbolTexts.some((t) => t.trim() === 'SPY'),
      `No alert with symbol SPY found in: [${symbolTexts.join(', ')}]`,
    ).toBe(true);

    await expectNoBrokenState(page, 'Alerts');
  });
});

// =============================================================================
// @coverage:covered OMS
// Navigate to OMS after placing paper order → orders table or stats render
// with a finite total.
// =============================================================================
test.describe('OMS — orders render after paper order placed', () => {
  test('OMS stats total-orders is a finite number', async ({ page }) => {
    await bootAppRealBackend(page);

    // Seed via PaperTrading first so OMS has something to show
    await goToWorkspace(page, 'PaperTrading');
    const symbolInput = page.getByTestId('pt-symbol-input');
    await symbolInput.clear();
    await symbolInput.fill('SPY');
    await symbolInput.press('Tab');
    await page.getByTestId('pt-side-select').selectOption('BUY');
    await page.getByTestId('pt-type-select').selectOption('MARKET');
    const qtyInput = page.getByTestId('pt-qty-input');
    await qtyInput.clear();
    await qtyInput.fill('1');
    await page.getByTestId('pt-place-btn').click();
    // Don't assert order yet — just ensure it was submitted
    await page.waitForTimeout(1_000);

    // Navigate to OMS
    await goToWorkspace(page, 'OMS');

    // Click Refresh to ensure latest data
    const refreshBtn = page.getByRole('button', { name: /Refresh/i }).first();
    if (await refreshBtn.count()) await refreshBtn.click();

    // Wait for stats to load (either stat chip or order count text appears)
    const statsTotal = page.getByTestId('oms-stats-total');
    const ordersCount = page.getByTestId('oms-orders-count');

    // At least one should be visible
    await expect(statsTotal.or(ordersCount)).toBeVisible({ timeout: 20_000 });

    // Assert stat total is a finite number (could be 0 if no OMS orders yet)
    if (await statsTotal.count()) {
      const totalText = await statsTotal.innerText();
      assertFiniteText(totalText, 'oms-stats-total');
    }

    // Assert orders count text is present
    if (await ordersCount.count()) {
      const countText = await ordersCount.innerText();
      expect(countText, 'OMS orders count should be visible').toBeTruthy();
    }

    await expectNoBrokenState(page, 'OMS');
  });
});

// =============================================================================
// @coverage:covered Execution
// Place order via OrderTicket in Execution workspace → order appears in
// active orders table.
// =============================================================================
test.describe('Execution — place order via OrderTicket', () => {
  test('BUY 1 SPY market → active order row appears', async ({ page }) => {
    await bootAppRealBackend(page);
    await goToWorkspace(page, 'Execution');

    // Set symbol
    const symbolInput = page.getByTestId('exec-symbol-input');
    await symbolInput.clear();
    await symbolInput.fill('SPY');

    // Click BUY
    await page.getByTestId('exec-buy-btn').click();

    // Set type = market
    await page.getByTestId('exec-type-select').selectOption('market');

    // Set qty = 1
    const qtyInput = page.getByTestId('exec-qty-input');
    await qtyInput.clear();
    await qtyInput.fill('1');

    // Place order
    await page.getByTestId('exec-place-btn').click();

    // Wait for active row to appear
    await expect(page.getByTestId('exec-active-row').first()).toBeVisible({ timeout: 20_000 });

    // Assert orders are shown
    const activeCount = await page.getByTestId('exec-active-row').count();
    expect(activeCount, 'Expected at least one active order row').toBeGreaterThanOrEqual(1);

    await expectNoBrokenState(page, 'Execution');
  });
});

// =============================================================================
// @coverage:covered Portfolio
// Open Portfolio after placing paper orders → PnL chips render finite values.
// =============================================================================
test.describe('Portfolio — PnL chips render after action', () => {
  test('portfolio-pnl-realized is a finite value (not —)', async ({ page }) => {
    await bootAppRealBackend(page);

    // Seed: place a paper order so portfolio has context
    await goToWorkspace(page, 'PaperTrading');
    const symbolInput = page.getByTestId('pt-symbol-input');
    await symbolInput.clear();
    await symbolInput.fill('SPY');
    await symbolInput.press('Tab');
    await page.getByTestId('pt-side-select').selectOption('BUY');
    await page.getByTestId('pt-type-select').selectOption('MARKET');
    const qtyInput = page.getByTestId('pt-qty-input');
    await qtyInput.clear();
    await qtyInput.fill('1');
    await page.getByTestId('pt-place-btn').click();
    await page.waitForTimeout(1_000);

    // Navigate to Portfolio
    await goToWorkspace(page, 'Portfolio');

    // Click Refresh All
    const refreshBtn = page.getByRole('button', { name: /Refresh All/i }).first();
    if (await refreshBtn.count()) await refreshBtn.click();

    // PnL grid should appear (not the empty state)
    await expect(page.getByTestId('portfolio-pnl-grid')).toBeVisible({ timeout: 20_000 });

    // Realized PnL chip must show a finite value
    const realizedText = await page.getByTestId('portfolio-pnl-realized').innerText();
    assertFiniteText(realizedText, 'portfolio-pnl-realized');

    // Total PnL chip must show a finite value
    const totalText = await page.getByTestId('portfolio-pnl-total').innerText();
    assertFiniteText(totalText, 'portfolio-pnl-total');

    // Empty state must NOT be shown
    await expect(page.getByTestId('portfolio-pnl-empty')).not.toBeVisible();

    await expectNoBrokenState(page, 'Portfolio');
  });
});

// =============================================================================
// @coverage:covered Backtesting
// Accept disclaimer → run preview backtest → metrics panel renders with
// a finite Total P&L value.
// =============================================================================
test.describe('Backtesting — preview backtest runs and renders metrics', () => {
  test('accept disclaimer → run → preview-metrics visible with finite P&L', async ({ page }) => {
    await bootAppRealBackend(page);
    await goToWorkspace(page, 'Backtesting');

    // Accept the research disclaimer if shown
    const disclaimerCheckbox = page.getByTestId('preview-disclaimer-checkbox');
    if (await disclaimerCheckbox.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await disclaimerCheckbox.check();
    }

    // Wait for the run button to appear after disclaimer
    const runBtn = page.getByTestId('preview-run-btn');
    await expect(runBtn).toBeVisible({ timeout: 10_000 });

    // Click Run Preview Backtest
    await runBtn.click();

    // Wait for metrics grid to appear (backtest may take a few seconds)
    await expect(page.getByTestId('preview-metrics')).toBeVisible({ timeout: 30_000 });

    // Total P&L chip must show a finite value
    const pnlText = await page.getByTestId('preview-pnl').innerText();
    assertFiniteText(pnlText, 'preview-pnl');
    // Value should be formatted number: +0.00, +1234.56, -50.00, etc.
    expect(pnlText.trim(), 'preview-pnl should not be empty string').not.toBe('');

    // Trades chip should show a finite count
    const tradesText = await page.getByTestId('preview-trades').innerText();
    assertFiniteText(tradesText, 'preview-trades');

    // Empty state should no longer be shown
    await expect(page.getByTestId('preview-empty')).not.toBeVisible();

    await expectNoBrokenState(page, 'Backtesting');
  });
});

// =============================================================================
// Proof-it-bites: intercept APIs to return empty → assertions turn RED
//
// These tests prove that the assertions in the main tests above are meaningful:
// if the backend returns empty/broken data, the element we assert on is absent.
// =============================================================================
test.describe('proof-it-bites: empty backend → assertions fail', () => {

  test('PaperTrading: empty orders response → no order row rendered', async ({ page }) => {
    await bootAppRealBackend(page);

    // Intercept both GET and POST for paper trading orders to return empty lists
    await page.route('**/api/paper-trading/orders**', (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ orders: [] }) });
      }
    });
    // Also intercept the refresh endpoint
    await page.route('**/api/paper-trading**', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ orders: [], fills: [], positions: [] }) });
      } else {
        route.continue();
      }
    });

    await goToWorkspace(page, 'PaperTrading');
    await page.getByTestId('pt-qty-input').fill('5');
    await page.getByTestId('pt-place-btn').click();
    await page.waitForTimeout(2_000);

    // No order row should appear because backend returned empty
    // This proves: the main test assertion would FAIL if data were empty
    await expect(page.getByTestId('pt-order-row')).toHaveCount(0);
  });

  test('Alerts: empty alerts response → no alert item rendered', async ({ page }) => {
    await bootAppRealBackend(page);

    // Intercept alerts API to return empty list (after POST creates alert, GET returns nothing)
    await page.route('**/api/alerts**', (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'fake-id' }) });
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ alerts: [] }) });
      }
    });

    await goToWorkspace(page, 'Alerts');

    const symbolInput = page.getByTestId('alerts-symbol-input');
    await symbolInput.clear();
    await symbolInput.fill('SPY');
    await page.getByTestId('alerts-type-select').selectOption('price_above');
    const thresholdInput = page.getByTestId('alerts-threshold-input');
    await expect(thresholdInput).toBeVisible({ timeout: 5_000 });
    await thresholdInput.fill('100');
    await page.getByTestId('alerts-create-btn').click();
    await page.waitForTimeout(2_000);

    // No alert item should appear — proves main test assertion would fail with empty
    await expect(page.getByTestId('alerts-item')).toHaveCount(0);
    // Empty state shown instead
    await expect(page.getByTestId('alerts-empty')).toBeVisible();
  });

  test('Portfolio: empty PnL response → portfolio-pnl-grid not rendered', async ({ page }) => {
    await bootAppRealBackend(page);

    // Intercept portfolio PnL to return null
    await page.route('**/api/portfolio/pnl**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(null) });
    });
    await page.route('**/api/portfolio/**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await goToWorkspace(page, 'Portfolio');

    // PnL grid should NOT be visible (backend returned null/empty)
    // This proves: the main test assertion would fail with no real PnL data
    await expect(page.getByTestId('portfolio-pnl-grid')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('portfolio-pnl-empty')).toBeVisible({ timeout: 5_000 });
  });

  test('Backtesting: failed backtest run → preview-metrics not rendered', async ({ page }) => {
    await bootAppRealBackend(page);

    // Intercept backtest run to return error/empty
    await page.route('**/api/backtest/run**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await goToWorkspace(page, 'Backtesting');

    // Accept disclaimer if shown
    const disclaimerCheckbox = page.getByTestId('preview-disclaimer-checkbox');
    if (await disclaimerCheckbox.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await disclaimerCheckbox.check();
    }

    const runBtn = page.getByTestId('preview-run-btn');
    await expect(runBtn).toBeVisible({ timeout: 10_000 });
    await runBtn.click();
    await page.waitForTimeout(3_000);

    // Metrics grid should NOT be visible (empty response has no metrics)
    // This proves: the main test assertion would fail with empty backtest result
    await expect(page.getByTestId('preview-metrics')).not.toBeVisible({ timeout: 5_000 });
  });
});
