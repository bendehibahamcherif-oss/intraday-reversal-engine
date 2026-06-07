import { test, expect } from '@playwright/test';
import { attachNetworkGuards } from './helpers/networkGuards';
import { bootApp, expectScreenSane, openDesktopWorkspace } from './helpers/appHarness';
import { desktopWorkspaces, requiredWorkspaceLabels, requiredWorkspaceNavLabels, workspaceById } from './helpers/workspaceData';

test('e2e API mock coverage: app boot has zero unmocked /api requests', async ({ page }) => {
  const guard = attachNetworkGuards(page);
  await bootApp(page);
  await expectScreenSane(page);
  const unmocked = guard.apiRequests.filter((request) => request.classification === 'unknown-unmocked-api-request');
  expect(unmocked).toEqual([]);
  guard.assertClean();
});

test('chart/feed polling cleanup: switching away from Chart has no repeated aborted polling failures', async ({ page }) => {
  const guard = attachNetworkGuards(page);
  await bootApp(page);
  await openDesktopWorkspace(page, workspaceById('ChartOrderflow')!);
  await openDesktopWorkspace(page, workspaceById('LiveData')!);
  await openDesktopWorkspace(page, workspaceById('Portfolio')!);
  await page.waitForTimeout(500);
  const forbiddenAborts = guard.failures.filter((failure) => failure.classification === 'forbidden-aborted-request');
  expect(forbiddenAborts).toEqual([]);
  guard.assertClean();
});

test('workspace label consistency: required journey labels come from canonical registry metadata', async () => {
  const labels = requiredWorkspaceLabels(['HistoricalData', 'AILab', 'Backtesting', 'MacroMultiAsset', 'Portfolio', 'Risk']);
  const navLabels = requiredWorkspaceNavLabels(['HistoricalData', 'AILab', 'Backtesting', 'MacroMultiAsset', 'Portfolio', 'Risk']);
  expect(labels).toEqual(labels.map((label) => desktopWorkspaces.find((workspace) => workspace.label === label)?.label));
  expect(navLabels).toEqual(['Historical Data', 'AI Lab', 'Backtesting', 'Macro', 'Portfolio', 'Risk']);
});

test('Settings / More is validated separately from desktop workspace label lookup', async ({ page }) => {
  const settings = workspaceById('Settings');
  expect(settings?.label).toBe('Settings / More');
  expect(settings?.desktopVisible).toBe(false);

  await bootApp(page, { viewport: { width: 390, height: 844 } });
  await page.getByTestId('mobile-more-workspaces').click();
  const moreDialog = page.getByRole('dialog', { name: /more workspaces/i });
  await expect(moreDialog).toBeVisible();
  await expect(moreDialog.getByRole('button', { name: settings!.label, exact: true })).toBeVisible();
});
