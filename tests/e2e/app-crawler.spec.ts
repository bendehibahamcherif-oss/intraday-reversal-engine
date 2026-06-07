import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { attachNetworkGuards } from './helpers/networkGuards';
import { bootApp, expectScreenSane, openDesktopWorkspace, scanVisibleInvalidValues } from './helpers/appHarness';
import { desktopWorkspaces, duplicateLabels } from './helpers/workspaceData';

test('automated desktop app crawler opens every workspace and records contract evidence', async ({ page }) => {
  const guard = attachNetworkGuards(page);
  const consoleErrors: string[] = [];
  const pageExceptions: string[] = [];
  const failedNetwork: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (error) => pageExceptions.push(error.message));
  page.on('requestfailed', (request) => failedNetwork.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`));

  await bootApp(page);
  const visibleLabels = await page.locator('aside button[title], aside button[data-tooltip]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('title') || button.getAttribute('data-tooltip') || '').filter(Boolean));
  const duplicateMenuLabels = duplicateLabels(visibleLabels);
  const workspaces: any[] = [];

  for (const workspace of desktopWorkspaces) {
    await openDesktopWorkspace(page, workspace);
    const sanity = await scanVisibleInvalidValues(page);
    workspaces.push({ id: workspace.id, label: workspace.label, title: await page.title(), invalidText: sanity.invalidText, invalidSvgAttrs: sanity.invalidSvgAttrs });
    expect(sanity.invalidText, `${workspace.label} rendered invalid text`).toEqual([]);
    expect(sanity.invalidSvgAttrs, `${workspace.label} rendered invalid SVG attributes`).toEqual([]);
  }

  const results = { generatedAt: new Date().toISOString(), visibleLabels, duplicateMenuLabels, consoleErrors, pageExceptions, failedNetwork, apiRequests: guard.apiRequests, workspaces };
  fs.writeFileSync('APP_CRAWLER_RESULTS.json', JSON.stringify(results, null, 2));
  expect(duplicateMenuLabels).toEqual([]);
  expect(pageExceptions).toEqual([]);
  await expectScreenSane(page);
  guard.assertClean();
});
