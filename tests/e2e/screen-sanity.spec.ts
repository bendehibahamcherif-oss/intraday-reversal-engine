import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { attachNetworkGuards } from './helpers/networkGuards';
import { bootApp, openDesktopWorkspace, scanVisibleInvalidValues } from './helpers/appHarness';
import { desktopWorkspaces } from './helpers/workspaceData';

test('screen value scanner rejects invalid visible text and chart coordinates in every workspace', async ({ page }) => {
  const guard = attachNetworkGuards(page);
  await bootApp(page);
  const scans: any[] = [];
  for (const workspace of desktopWorkspaces) {
    await openDesktopWorkspace(page, workspace);
    const sanity = await scanVisibleInvalidValues(page);
    scans.push({ id: workspace.id, label: workspace.label, invalidText: sanity.invalidText, invalidSvgAttrs: sanity.invalidSvgAttrs });
  }
  fs.writeFileSync('SCREEN_SANITY_RESULTS.json', JSON.stringify({ generatedAt: new Date().toISOString(), scans, apiRequests: guard.apiRequests }, null, 2));
  const failures = scans.filter((scan) => scan.invalidText.length || scan.invalidSvgAttrs.length);
  expect(failures).toEqual([]);
  guard.assertClean();
});
