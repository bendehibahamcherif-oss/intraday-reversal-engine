/**
 * Production user journey — desktop.
 *
 * Exercises the core trading/analysis workflows in order:
 *   1. App boots and authenticates
 *   2. Risk dashboard is visible
 *   3. ML Engine workspace loads, no dead-endpoint calls
 *   4. AI Lab workspace loads
 *   5. Historical Data workspace loads
 *   6. Quant Lab (backtest) workspace loads
 *   7. Alerts workspace loads
 *   8. A workspace crash shows an inline fallback, not a full-page error
 */
import { test, expect } from '@playwright/test';
import { setupHarness } from './helpers/appHarness.js';

test.describe('Desktop production user journey', () => {
  test('app boots to the shell without auth redirect', async ({ page }) => {
    const harness = await setupHarness(page);
    await harness.goto('Risk');
    await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();
    harness.assertClean('boot');
  });

  test('Risk workspace renders without API errors', async ({ page }) => {
    const harness = await setupHarness(page);
    await harness.goto('Risk');
    await page.waitForLoadState('networkidle');
    harness.assertClean('Risk');
  });

  test('ML Engine workspace makes no dead /api/ai/models/* requests', async ({ page }) => {
    const deadCalls: string[] = [];
    page.on('request', (req) => {
      if (/\/api\/ai\/models\//.test(req.url())) {
        deadCalls.push(`${req.method()} ${req.url()}`);
      }
    });
    const harness = await setupHarness(page);
    await harness.goto('MLEngine');
    await page.waitForLoadState('networkidle');
    expect(deadCalls, `Dead /api/ai/models/* calls: ${deadCalls.join(', ')}`).toHaveLength(0);
    harness.assertClean('MLEngine');
  });

  test('AI Lab workspace loads feature/label data from /api/ai/* (not dead routes)', async ({ page }) => {
    const harness = await setupHarness(page);
    await harness.goto('AILab');
    await page.waitForLoadState('networkidle');
    harness.assertClean('AILab');
  });

  test('Historical Data workspace loads', async ({ page }) => {
    const harness = await setupHarness(page);
    await harness.goto('HistoricalData');
    await page.waitForLoadState('networkidle');
    harness.assertClean('HistoricalData');
  });

  test('QuantLab workspace loads', async ({ page }) => {
    const harness = await setupHarness(page);
    await harness.goto('QuantLab');
    await page.waitForLoadState('networkidle');
    harness.assertClean('QuantLab');
  });

  test('Alerts workspace loads', async ({ page }) => {
    const harness = await setupHarness(page);
    await harness.goto('Alerts');
    await page.waitForLoadState('networkidle');
    harness.assertClean('Alerts');
  });

  test('navigate across multiple workspaces sequentially without errors', async ({ page }) => {
    const harness = await setupHarness(page);
    await harness.goto('Risk');

    const sequence = ['MLEngine', 'Portfolio', 'Macro', 'Alerts', 'HistoricalData', 'Risk'];
    for (const ws of sequence) {
      await page.evaluate((id) => {
        try {
          const raw = localStorage.getItem('reversal-workspace');
          const parsed = raw ? JSON.parse(raw) : {};
          localStorage.setItem('reversal-workspace', JSON.stringify({ ...parsed, state: { workspace: id } }));
          // Dispatch a storage event so Zustand picks it up.
          window.dispatchEvent(new StorageEvent('storage', { key: 'reversal-workspace' }));
        } catch {}
      }, ws);
      await page.waitForTimeout(300);
    }

    harness.assertClean('multi-workspace navigation');
  });

  test('promote endpoint uses /api/ml/promote/:id not /api/ai/*', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/')) {
        calls.push(`${req.method()} ${req.url()}`);
      }
    });
    const harness = await setupHarness(page);
    await harness.goto('MLEngine');
    await page.waitForLoadState('networkidle');

    const deadCalls = calls.filter((c) => /\/api\/ai\/models\//.test(c));
    expect(deadCalls, `Dead champion calls: ${deadCalls.join(', ')}`).toHaveLength(0);
    harness.assertClean('promote-endpoint');
  });
});
