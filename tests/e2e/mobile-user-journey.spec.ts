import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { attachNetworkGuards } from './helpers/networkGuards';
import { bootApp, expectScreenSane, openMobileWorkspace } from './helpers/appHarness';
import { duplicateLabels, mobileWorkspaces, requiredWorkspaceNavLabels } from './helpers/workspaceData';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const required = requiredWorkspaceNavLabels(['HistoricalData', 'AILab', 'Backtesting', 'MacroMultiAsset', 'Portfolio', 'Risk']);

test('mobile production journey reaches all critical implemented workspaces', async ({ page }) => {
  const guard = attachNetworkGuards(page);
  await bootApp(page, { viewport: { width: 390, height: 844 } });
  await page.getByTestId('mobile-more-workspaces').click();
  const moreLabels = await page.getByRole('dialog', { name: /more workspaces/i }).locator('button[aria-label]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') || '').filter(Boolean));
  const primaryLabels = await page.locator('nav[aria-label="Mobile workspace navigation"] button[title]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('title') || '').filter((label) => label && label !== 'More'));
  await page.getByRole('button', { name: /close more workspaces/i }).click();
  const labels = [...primaryLabels, ...moreLabels];
  expect(duplicateLabels(labels)).toEqual([]);
  for (const label of required) expect(labels).toContain(label);

  for (const workspace of mobileWorkspaces) {
    await openMobileWorkspace(page, workspace);
    await expectScreenSane(page);
  }
  fs.writeFileSync('MOBILE_USER_JOURNEY_RESULTS.json', JSON.stringify({ generatedAt: new Date().toISOString(), labels, apiRequests: guard.apiRequests }, null, 2));
  guard.assertClean();
});
