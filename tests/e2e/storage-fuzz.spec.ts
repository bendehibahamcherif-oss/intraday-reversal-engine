import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { attachNetworkGuards } from './helpers/networkGuards';
import { installAuthState, installSafeApiMocks, scanVisibleInvalidValues } from './helpers/appHarness';

const scenarioResults: any[] = [];

const scenarios = [
  { name: 'invalid JSON in known keys', values: { 'reversal-workspace': '{bad', 'reversal-watchlist': '{bad', 'reversal-terminal-layout': '{bad', 'reversal-historical-data': '{bad' } },
  { name: 'selectedMlDatasetId undefined', values: { 'reversal-ai-lab': JSON.stringify({ state: { selectedMlDatasetId: undefined } }) } },
  { name: 'selectedMlDatasetId string undefined', values: { 'reversal-ai-lab': JSON.stringify({ state: { selectedMlDatasetId: 'undefined' } }) } },
  { name: 'selectedBacktestDatasetId missing', values: { 'reversal-backtest': JSON.stringify({ state: { selectedBacktestDatasetId: 'missing' } }) } },
  { name: 'selectedCorrelationDataset malformed', values: { 'reversal-macro': JSON.stringify({ state: { selectedCorrelationDataset: { id: {}, symbols: null } } }) } },
  { name: 'invalid active workspace', values: { 'reversal-workspace': JSON.stringify({ state: { workspace: 'NotAWorkspace' }, version: 0 }) } },
  { name: 'fallback demo provider forced active', values: { 'reversal-feed-store': JSON.stringify({ state: { activeProviders: ['fallback_demo'], providers: ['fallback_demo'] } }) } },
  { name: 'stale training error', values: { 'reversal-ml-store': JSON.stringify({ state: { trainingError: 'stale error', selectedDatasetId: 'undefined' } }) } },
  { name: 'stale champion model', values: { 'reversal-ml-store': JSON.stringify({ state: { championModel: { id: 'stale', datasetId: 'undefined' } } }) } },
  { name: 'empty watchlist', values: { 'reversal-watchlist': JSON.stringify({ state: { watchlist: [] }, version: 0 }) } },
  { name: 'malformed layout object', values: { 'reversal-terminal-layout': JSON.stringify({ state: { layout: { panels: null, sizes: ['NaN'] } }, version: 0 }) } },
];

test.describe('localStorage/zustand corruption fuzzing', () => {
  for (const scenario of scenarios) {
    test(`${scenario.name} recovers without blank shell`, async ({ page }) => {
      const guard = attachNetworkGuards(page);
      await installAuthState(page);
      await installSafeApiMocks(page);
      await page.addInitScript((values) => {
        for (const [key, value] of Object.entries(values)) localStorage.setItem(key, String(value));
        localStorage.setItem('reversal_user_token', 'e2e-token');
        localStorage.setItem('reversal_user_profile', JSON.stringify({ id: 'e2e-user', email: 'e2e@example.com' }));
      }, scenario.values);
      await page.goto('/');
      await expect(page.locator('body')).toBeVisible();
      await page.waitForTimeout(400);
      const text = await page.locator('body').innerText();
      const sanity = await scanVisibleInvalidValues(page);
      const result = { generatedAt: new Date().toISOString(), scenario: scenario.name, textPreview: text.slice(0, 1000), invalidText: sanity.invalidText, invalidSvgAttrs: sanity.invalidSvgAttrs, apiRequests: guard.apiRequests };
      scenarioResults.push(result);
      fs.writeFileSync('STORAGE_FUZZ_RESULTS.json', JSON.stringify({ generatedAt: new Date().toISOString(), scenarios: scenarioResults }, null, 2));
      expect(text.length).toBeGreaterThan(20);
      expect(sanity.invalidText).toEqual([]);
      expect(sanity.invalidSvgAttrs).toEqual([]);
      guard.assertClean();
    });
  }
});
