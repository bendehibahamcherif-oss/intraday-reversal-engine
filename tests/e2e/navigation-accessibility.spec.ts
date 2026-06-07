import { test, expect } from '@playwright/test';
import { bootApp, openDesktopWorkspace, openMobileWorkspace } from './helpers/appHarness';
import { desktopWorkspaces, duplicateLabels, mobilePrimaryWorkspaces, mobileMoreWorkspaces, mobileWorkspaces } from './helpers/workspaceData';

test.describe('desktop navigation accessibility', () => {
  test('exposes implemented workspace buttons and opens every desktop workspace', async ({ page }) => {
    await bootApp(page);

    for (const workspace of desktopWorkspaces) {
      await expect(page.getByTestId(workspace.navTestId), `${workspace.id} test selector`).toBeVisible();
      await expect(page.getByRole('button', { name: workspace.ariaLabel, exact: true }), `${workspace.id} aria label`).toBeVisible();
    }

    const labels = await page.locator('aside button[aria-label]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') || '').filter(Boolean));
    expect(duplicateLabels(labels)).toEqual([]);

    for (const workspace of desktopWorkspaces) {
      await openDesktopWorkspace(page, workspace);
      await expect(page.getByTestId(workspace.navTestId)).toHaveAttribute('aria-label', workspace.ariaLabel);
    }
  });
});

test.describe('mobile navigation accessibility', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('exposes primary and more navigation and opens every mobile workspace', async ({ page }) => {
    await bootApp(page);

    for (const workspace of mobilePrimaryWorkspaces) {
      await expect(page.getByTestId(workspace.navTestId), `${workspace.id} primary test selector`).toBeVisible();
      await expect(page.getByRole('button', { name: workspace.ariaLabel, exact: true }), `${workspace.id} primary aria label`).toBeVisible();
    }

    if (mobileMoreWorkspaces.length > 0) {
      await expect(page.getByTestId('mobile-more-workspaces')).toBeVisible();
      await expect(page.getByRole('button', { name: 'More workspaces', exact: true })).toBeVisible();
      await page.getByTestId('mobile-more-workspaces').click();
      await expect(page.getByRole('dialog', { name: /more workspaces/i })).toBeVisible();
      for (const workspace of mobileMoreWorkspaces) {
        await expect(page.getByTestId(workspace.navTestId), `${workspace.id} more test selector`).toBeVisible();
        await expect(page.getByRole('button', { name: workspace.ariaLabel, exact: true }), `${workspace.id} more aria label`).toBeVisible();
      }
      const labels = [
        ...await page.locator('nav[aria-label="Mobile workspace navigation"] button[aria-label]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') || '').filter((label) => label && label !== 'More workspaces')),
        ...await page.getByRole('dialog', { name: /more workspaces/i }).locator('button[aria-label]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') || '').filter((label) => label && label !== 'Close more workspaces')),
      ];
      expect(duplicateLabels(labels)).toEqual([]);
      await page.getByRole('button', { name: /close more workspaces/i }).click();
    } else {
      await expect(page.getByTestId('mobile-more-workspaces')).toHaveCount(0);
      const labels = await page.locator('nav[aria-label="Mobile workspace navigation"] button[aria-label]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') || '').filter(Boolean));
      expect(duplicateLabels(labels)).toEqual([]);
    }

    for (const workspace of mobileWorkspaces) {
      await openMobileWorkspace(page, workspace);
      await expect(page.locator('body'), `${workspace.id} remains rendered after navigation`).toBeVisible();
    }
  });
});
