/**
 * Mobile workspace crawler.
 *
 * Visits every workspace through the mobile bottom nav (primary tabs + More
 * drawer), confirms the workspace loads without console errors or dead routes.
 */
import { test, expect } from '@playwright/test';
import { setupHarness } from './helpers/appHarness.js';
import {
  MOBILE_PRIMARY_TAB_IDS,
  MOBILE_MORE_WORKSPACES,
} from '../../src/config/workspaces.js';

test.use({ viewport: { width: 393, height: 851 } });

test.describe('Mobile workspace crawler', () => {
  // Primary tabs
  for (const id of MOBILE_PRIMARY_TAB_IDS) {
    test(`primary tab ${id} navigates correctly`, async ({ page }) => {
      const harness = await setupHarness(page);
      await harness.goto(id);
      await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();
      await page.waitForLoadState('networkidle');
      harness.assertClean(`mobile primary tab ${id}`);
    });
  }

  // More drawer workspaces
  for (const ws of MOBILE_MORE_WORKSPACES) {
    test(`more drawer workspace ${ws.id} renders without errors`, async ({ page }) => {
      const harness = await setupHarness(page);
      await harness.goto(ws.id);
      await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();
      await page.waitForLoadState('networkidle');
      harness.assertClean(`mobile more=${ws.id}`);
    });
  }

  test('More button opens drawer listing all secondary workspaces', async ({ page }) => {
    const harness = await setupHarness(page);
    await harness.goto(MOBILE_PRIMARY_TAB_IDS[0]);
    await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();

    // Open the More drawer.
    await page.locator('[data-testid="mobile-tab-more"]').click();
    await expect(page.locator('[data-testid="more-drawer"]')).toBeVisible();

    // Every non-primary workspace must be in the drawer.
    for (const ws of MOBILE_MORE_WORKSPACES) {
      await expect(page.locator(`[data-testid="more-item-${ws.id}"]`)).toBeVisible();
    }

    harness.assertClean('more-drawer open');
  });

  test('Selecting a workspace from the drawer navigates to it', async ({ page }) => {
    const harness = await setupHarness(page);
    await harness.goto(MOBILE_PRIMARY_TAB_IDS[0]);
    await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();

    // Open drawer and pick first More workspace.
    await page.locator('[data-testid="mobile-tab-more"]').click();
    const firstMore = MOBILE_MORE_WORKSPACES[0];
    await page.locator(`[data-testid="more-item-${firstMore.id}"]`).click();

    // Drawer closes and workspace renders.
    await expect(page.locator('[data-testid="more-drawer"]')).not.toBeVisible();
    await page.waitForLoadState('networkidle');

    harness.assertClean(`drawer select ${firstMore.id}`);
  });
});
