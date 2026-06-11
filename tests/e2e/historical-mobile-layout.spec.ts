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

  // Wait for the detail panel to be visible
  await expect(page.getByTestId('dataset-detail-panel')).toBeVisible({ timeout: 4000 });

  // Audit all visible buttons in the workspace with rich diagnostics
  const buttons = await page.evaluate(() => {
    const workspace = document.querySelector('.historical-data-workspace');
    if (!workspace) return [] as Array<{ textContent: string; ariaLabel: string; dataTestId: string; className: string; width: number; height: number; computedMinHeight: string; computedPadding: string; computedLineHeight: string }>;
    const btns = [...workspace.querySelectorAll('button')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    return btns.map((b) => {
      const r = b.getBoundingClientRect();
      const cs = window.getComputedStyle(b);
      return {
        textContent: b.textContent?.trim() || '',
        ariaLabel: b.getAttribute('aria-label') || '',
        dataTestId: b.getAttribute('data-testid') || '',
        className: typeof b.className === 'string' ? b.className : String(b.className || ''),
        width: r.width,
        height: r.height,
        computedMinHeight: cs.minHeight,
        computedPadding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
        computedLineHeight: cs.lineHeight,
      };
    });
  });

  const shortButtons = buttons.filter((button) => button.height < 44);
  if (shortButtons.length) {
    console.log('Historical Data short mobile buttons', JSON.stringify(shortButtons, null, 2));
  }

  expect(buttons.length, 'No visible buttons found in Historical Data workspace').toBeGreaterThan(0);

  for (const button of buttons) {
    const label = button.ariaLabel || button.textContent || button.dataTestId || '<unlabelled>';
    expect(
      button.height,
      `Button "${label}" (${button.className}) height ${button.height}px too small`,
    ).toBeGreaterThanOrEqual(44);
  }
});

test('historical data workspace: long detail fields stay contained on mobile', async ({ page }) => {
  await navigateToHistoricalData(page);

  // Wait for the dataset list and click into the detail view
  await expect(page.getByTestId('dataset-list-panel')).toContainText('e2e-dataset', { timeout: 6000 });
  await page.getByTestId('dataset-list-panel').getByText('e2e-dataset').first().click();
  await expect(page.getByTestId('dataset-detail-panel')).toBeVisible({ timeout: 4000 });

  const metrics = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const bodyOverflow = document.body.scrollWidth - viewportWidth;
    const documentOverflow = document.documentElement.scrollWidth - viewportWidth;
    const workspace = document.querySelector('.historical-data-workspace') || document.body;
    const textCells = [...workspace.querySelectorAll('td, div, span')]
      .filter((el) => /e2e-dataset|\/data\/historical/.test(el.textContent || ''))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tagName: el.tagName,
          preview: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
          className: typeof el.className === 'string' ? el.className : String(el.className || ''),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          x: rect.x,
          right: rect.right,
          left: rect.left,
          width: rect.width,
        };
      });
    const overflowingElements = [...workspace.querySelectorAll('*')]
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tagName: el.tagName,
          text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
          className: typeof el.className === 'string' ? el.className : String(el.className || ''),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          x: rect.x,
          width: rect.width,
          viewportWidth,
        };
      })
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.x + el.width > viewportWidth + 1 || el.x < -1);
    return { bodyOverflow, documentOverflow, textCells, overflowingElements, viewportWidth };
  });

  if (metrics.overflowingElements.length) {
    console.log('Historical Data mobile overflowing elements', JSON.stringify(metrics.overflowingElements, null, 2));
  }

  const firstOverflow = metrics.overflowingElements[0];
  const overflowMessage = firstOverflow
    ? `Overflow element: ${firstOverflow.tagName}.${firstOverflow.className}, text=${firstOverflow.text}, scrollWidth=${firstOverflow.scrollWidth}, clientWidth=${firstOverflow.clientWidth}`
    : 'No overflowing Historical Data element recorded';

  expect(metrics.documentOverflow, `document overflowed horizontally by ${metrics.documentOverflow}px; ${overflowMessage}`).toBeLessThanOrEqual(1);
  expect(metrics.bodyOverflow, `body overflowed horizontally by ${metrics.bodyOverflow}px; ${overflowMessage}`).toBeLessThanOrEqual(1);

  for (const cell of metrics.textCells) {
    const cellMessage = `Overflow element: ${cell.tagName}.${cell.className}, text=${cell.preview}, scrollWidth=${cell.scrollWidth}, clientWidth=${cell.clientWidth}`;
    expect(cell.right, cellMessage).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(cell.left, cellMessage).toBeGreaterThanOrEqual(-1);
  }
});
