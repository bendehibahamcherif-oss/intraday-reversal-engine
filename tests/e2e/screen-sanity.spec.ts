/**
 * Per-workspace screen sanity checks.
 *
 * Each test:
 *  1. Navigates to the workspace
 *  2. Waits for networkidle
 *  3. Asserts the page does not show an uncaught error overlay
 *  4. Asserts at least some content is visible (non-empty body)
 *  5. Asserts no console errors occurred
 */
import { test, expect } from '@playwright/test';
import { setupHarness } from './helpers/appHarness.js';
import { WORKSPACES } from '../../src/config/workspaces.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function assertNoErrorOverlay(page: import('@playwright/test').Page) {
  // Full-screen error boundary shows a red/error page — check it's NOT visible.
  // We look for the inline crash-fallback card (scoped) vs the full crash page.
  const bodyText = await page.locator('body').innerText();
  const hasFullCrash =
    bodyText.includes('Application Error') &&
    bodyText.includes('Clear storage and reload');
  expect(hasFullCrash, 'Full-screen error boundary triggered').toBe(false);
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Per-workspace screen sanity', () => {
  for (const ws of WORKSPACES) {
    test(`${ws.id} — no crash, non-empty, no console errors`, async ({ page }) => {
      const harness = await setupHarness(page);
      await harness.goto(ws.id);
      await page.waitForLoadState('networkidle');

      // App shell present.
      await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();

      // No full-screen crash overlay.
      await assertNoErrorOverlay(page);

      // Body has meaningful content (more than just whitespace/HTML tags).
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.trim().length, `${ws.id} body appears empty`).toBeGreaterThan(10);

      harness.assertClean(ws.id);
    });
  }
});
