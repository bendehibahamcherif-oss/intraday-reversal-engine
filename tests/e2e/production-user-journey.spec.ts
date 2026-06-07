import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { attachNetworkGuards } from './helpers/networkGuards';
import { bootApp, expectScreenSane, openDesktopWorkspace } from './helpers/appHarness';
import { desktopWorkspaces, duplicateLabels, requiredWorkspaceLabels, workspaceById } from './helpers/workspaceData';

const majorLabels = requiredWorkspaceLabels(['ChartOrderflow', 'Macro', 'LiveData', 'Providers', 'Credentials', 'HistoricalData', 'AILab', 'Backtesting', 'MacroMultiAsset', 'Portfolio', 'Risk', 'Ops']);

function byLabel(label: string) {
  return desktopWorkspaces.find((workspace) => workspace.label === label || workspace.aliases?.includes(label));
}

test('desktop production user journey keeps datasets, ML, backtesting, macro, portfolio and risk stable', async ({ page }) => {
  const guard = attachNetworkGuards(page);
  await bootApp(page);
  const labels = await page.locator('aside button[title], aside button[data-tooltip]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('title') || button.getAttribute('data-tooltip') || '').filter(Boolean));
  expect(duplicateLabels(labels)).toEqual([]);

  for (const label of majorLabels) {
    const workspace = byLabel(label);
    expect(workspace, `workspace present for ${label}`).toBeTruthy();
    await openDesktopWorkspace(page, workspace!);
    await expectScreenSane(page);
  }

  await page.evaluate(() => {
    const dataset = { datasetId: 'e2e-dataset', id: 'e2e-dataset', symbols: ['SPY'], rowCount: 500, fileStatus: 'ready' };
    localStorage.setItem('reversal-historical-data', JSON.stringify({ state: { selectedMlDatasetId: 'e2e-dataset', selectedMlDataset: dataset, selectedBacktestDatasetId: 'e2e-dataset', selectedBacktestDataset: dataset, selectedCorrelationDatasetId: 'e2e-dataset', selectedCorrelationDataset: dataset }, version: 0 }));
    window.dispatchEvent(new CustomEvent('reversal:use-dataset-ml', { detail: { datasetId: 'e2e-dataset', dataset } }));
    window.dispatchEvent(new CustomEvent('reversal:use-dataset-backtest', { detail: { datasetId: 'e2e-dataset', dataset } }));
    window.dispatchEvent(new CustomEvent('reversal:use-dataset-correlation', { detail: { datasetId: 'e2e-dataset', dataset } }));
  });

  await openDesktopWorkspace(page, byLabel('AI Lab')!);
  await expect(page.locator('body')).toContainText(/e2e-dataset|Select a historical dataset|Selected dataset/i);
  await page.reload();
  await page.waitForTimeout(500);
  await openDesktopWorkspace(page, byLabel('AI Lab')!);
  await expect(page.locator('body')).toContainText(/e2e-dataset|Select a historical dataset|Selected dataset/i);

  const train = page.getByRole('button', { name: /train model/i }).first();
  if (await train.count()) await train.click();
  await openDesktopWorkspace(page, byLabel('ML Model Card') || byLabel('AI Lab')!);
  const promote = page.getByRole('button', { name: /promote/i }).first();
  if (await promote.count()) await promote.click();
  const infer = page.getByRole('button', { name: /infer|inference|run/i }).first();
  if (await infer.count()) await infer.click();

  await openDesktopWorkspace(page, byLabel('Backtesting')!);
  await expectScreenSane(page);
  await openDesktopWorkspace(page, byLabel('Macro / Multi-Asset')!);
  await expectScreenSane(page);
  await openDesktopWorkspace(page, byLabel('Portfolio')!);
  await expectScreenSane(page);
  await openDesktopWorkspace(page, byLabel('Risk')!);
  await expectScreenSane(page);

  const settingsWorkspace = workspaceById('Settings');
  expect(settingsWorkspace?.desktopVisible, 'Settings / More is a mobile-only More item, not a desktop workspace').toBe(false);
  expect(byLabel('Operations'), 'desktop Settings/More journey uses canonical Operations workspace').toBeTruthy();

  fs.writeFileSync('PRODUCTION_USER_JOURNEY_RESULTS.json', JSON.stringify({ generatedAt: new Date().toISOString(), labels, apiRequests: guard.apiRequests }, null, 2));
  expect(guard.apiRequests.some((request) => request.url.includes('/api/ml/model'))).toBeTruthy();
  guard.assertClean();
});
