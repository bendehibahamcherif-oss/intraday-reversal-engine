/**
 * Desktop workspace crawler.
 *
 * Visits every workspace via the sidebar, waits for the view to settle,
 * and asserts no console errors, dead-route calls, or bad URLs occur.
 */
import { test, expect } from '@playwright/test';
import { setupHarness } from './helpers/appHarness.js';
import { WORKSPACES } from '../../src/config/workspaces.js';

test.describe('Desktop workspace crawler', () => {
  for (const ws of WORKSPACES) {
    test(`workspace ${ws.id} renders without errors`, async ({ page }) => {
      const harness = await setupHarness(page);
      await harness.goto(ws.id);

      // The app shell must be present.
      await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();

      // Wait for the page to settle (no pending network requests).
      await page.waitForLoadState('networkidle');

      harness.assertClean(`workspace=${ws.id}`);
    });
  }
});
