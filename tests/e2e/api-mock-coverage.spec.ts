/**
 * API mock coverage test.
 *
 * Crawls the most active workspaces and asserts that every /api/* request
 * was served by a named mock handler (not the catch-all fallback).
 *
 * A non-empty `unmocked` list means a new API call was added to the app
 * but not yet registered in apiMocks.ts — update the catalog.
 */
import { test, expect } from '@playwright/test';
import { setupHarness } from './helpers/appHarness.js';

// Workspaces that make the most API calls — highest coverage value.
const ACTIVE_WORKSPACES = [
  'Risk',
  'MLEngine',
  'AILab',
  'Macro',
  'Portfolio',
  'Alerts',
  'HistoricalData',
  'QuantLab',
  'Execution',
  'LiveData',
];

test('all API calls from active workspaces are covered by named mocks', async ({ page }) => {
  const harness = await setupHarness(page);

  for (const ws of ACTIVE_WORKSPACES) {
    await harness.goto(ws);
    await page.waitForLoadState('networkidle');
  }

  expect(
    harness.unmocked,
    `Uncovered API routes (add to apiMocks.ts CATALOG):\n${harness.unmocked.map((u) => `  ${u}`).join('\n')}`,
  ).toHaveLength(0);
});
