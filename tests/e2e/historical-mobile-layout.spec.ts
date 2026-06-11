/**
 * Historical Data workspace — mobile layout regression tests.
 *
 * Verifies on iPhone 14 viewport (390×844):
 *   - The HistoricalData workspace is reachable via the More drawer
 *   - Layout is single-column (no horizontal overflow)
 *   - Dataset list panel renders above the detail panel
 *   - Action buttons are ≥ 44px (touch targets)
 *   - Long detail fields (paths, IDs) are contained within the viewport
 */

import { test, expect } from '@playwright/test';
import { bootApp, openMobileWorkspace } from './helpers/appHarness';

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const HIST_WORKSPACE = { id: 'HistoricalData', label: 'Historical Data', shortLabel: 'HD' };

test.use({ viewport: MOBILE_VIEWPORT });

async function navigateToHistoricalData(page: Parameters<typeof bootApp>[0]) {
  await bootApp(page, { viewport: MOBILE_VIEWPORT });
  await openMobileWorkspace(page, HIST_WORKSPACE);
  await expect(page.getByTestId('historical-data-workspace')).toBeVisible({ timeout: 6000 });
}

test('historical data workspace: no horizontal overflow on mobile', async ({ page }) => {
  await navigateToHistoricalData(page);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));

  expect(
    overflow.scrollWidth,
    `horizontal overflow: scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);

  expect(
    overflow.bodyScrollWidth,
    `body horizontal overflow: bodyScrollWidth ${overflow.bodyScrollWidth} > clientWidth ${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
});

test('historical data workspace: single-column layout on mobile', async ({ page }) => {
  await navigateToHistoricalData(page);

  const listPanel = page.getByTestId('dataset-list-panel');
  const workspaceRoot = page.getByTestId('historical-data-workspace');

  const listBox = await listPanel.boundingBox();
  const rootBox = await workspaceRoot.boundingBox();

  if (listBox && rootBox) {
    // On mobile the list panel is at the top; root starts at same y.
    // The main panel (second child) starts below the list panel.
    const mainPanelTop = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="historical-data-workspace"]');
      const children = root ? [...root.children] : [];
      if (children.length < 2) return null;
      return children[1].getBoundingClientRect().top;
    });

    if (mainPanelTop !== null) {
      expect(
        listBox.y,
        `dataset-list-panel (y=${listBox.y}) must appear above main panel (y=${mainPanelTop})`,
      ).toBeLessThan(mainPanelTop);
    }
  }
});

test('historical data workspace: buttons are tappable (min 44px touch target)', async ({ page }) => {
  await navigateToHistoricalData(page);

  // Wait for the dataset list to populate from the API
  await expect(page.getByTestId('dataset-list-panel')).toContainText('e2e-dataset', { timeout: 6000 });

  // Click the dataset row to open the detail panel with action buttons
  await page.getByTestId('dataset-list-panel').getByText('e2e-dataset').first().click();

  // Wait for the detail panel and action buttons to be visible
  await expect(page.getByTestId('dataset-detail-panel')).toBeVisible({ timeout: 4000 });
  await expect(page.getByTestId('dataset-actions')).toBeVisible({ timeout: 4000 });

  // Measure heights of the action buttons
  const buttonHeights = await page.evaluate(() => {
    const actions = document.querySelector('[data-testid="dataset-actions"]');
    if (!actions) return [] as number[];
    const btns = [...actions.querySelectorAll('button')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    return btns.map((b) => b.getBoundingClientRect().height);
  });

  expect(
    buttonHeights.length,
    'No visible action buttons found in [data-testid="dataset-actions"] — expected at least 1',
  ).toBeGreaterThan(0);

  for (const h of buttonHeights) {
    expect(h, `Action button height ${h}px too small — must be at least 44px`).toBeGreaterThanOrEqual(44);
  }
});

test('historical data workspace: long detail fields stay contained on mobile', async ({ page }) => {
  await navigateToHistoricalData(page);

  // Wait for the dataset list and click into the detail view
  await expect(page.getByTestId('dataset-list-panel')).toContainText('e2e-dataset', { timeout: 6000 });
  await page.getByTestId('dataset-list-panel').getByText('e2e-dataset').first().click();
  await expect(page.getByTestId('dataset-detail-panel')).toBeVisible({ timeout: 4000 });

  // No horizontal overflow after opening detail panel with long file paths
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));

  expect(
    overflow.scrollWidth,
    `horizontal overflow after detail open: scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);

  // Value cells must not spill past the right edge of their table
  const cellOverflows = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.dataset-value-cell')];
    return cells.map((cell) => {
      const r = cell.getBoundingClientRect();
      const tableEl = cell.closest('table');
      const tableR = tableEl ? tableEl.getBoundingClientRect() : null;
      return {
        cellRight: Math.round(r.right),
        tableRight: tableR ? Math.round(tableR.right) : Math.round(r.right),
        overflows: tableR ? r.right > tableR.right + 2 : false,
      };
    });
  });

  const overflowing = cellOverflows.filter((c) => c.overflows);
  expect(
    overflowing.length,
    `${overflowing.length} value cell(s) overflow their table: ${JSON.stringify(overflowing)}`,
  ).toBe(0);
});
