import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { attachNetworkGuards } from './helpers/networkGuards';
import { bootApp, openMobileWorkspace, scanVisibleInvalidValues } from './helpers/appHarness';
import { duplicateLabels, mobileWorkspaces } from './helpers/workspaceData';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('mobile crawler reaches every implemented mobile workspace without stale components', async ({ page }) => {
  const guard = attachNetworkGuards(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await bootApp(page);
  await page.getByTestId('mobile-more-workspaces').click();
  const moreLabels = await page.getByRole('dialog', { name: /more workspaces/i }).locator('button[aria-label]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') || '').filter(Boolean));
  const primaryLabels = await page.locator('nav[aria-label="Mobile workspace navigation"] button[title]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('title') || '').filter((label) => label && label !== 'More'));
  await page.getByRole('button', { name: /close more workspaces/i }).click();
  const duplicateMenuLabels = duplicateLabels([...primaryLabels, ...moreLabels]);
  const workspaces: any[] = [];
  for (const workspace of mobileWorkspaces) {
    await openMobileWorkspace(page, workspace);
    const sanity = await scanVisibleInvalidValues(page);
    const bodyBox = await page.locator('body').boundingBox();
    workspaces.push({ id: workspace.id, label: workspace.label, invalidText: sanity.invalidText, invalidSvgAttrs: sanity.invalidSvgAttrs, bodyBox });
    expect(sanity.invalidText, `${workspace.label} rendered invalid mobile text`).toEqual([]);
    expect(sanity.invalidSvgAttrs, `${workspace.label} rendered invalid mobile SVG attributes`).toEqual([]);
    expect(bodyBox?.width || 0).toBeGreaterThan(300);
  }
  const results = { generatedAt: new Date().toISOString(), labels: [...primaryLabels, ...moreLabels], duplicateMenuLabels, errors, apiRequests: guard.apiRequests, workspaces };
  fs.writeFileSync('MOBILE_APP_CRAWLER_RESULTS.json', JSON.stringify(results, null, 2));
  expect(duplicateMenuLabels).toEqual([]);
  expect(errors).toEqual([]);
  guard.assertClean();
});
