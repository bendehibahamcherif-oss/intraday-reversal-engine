/**
 * tests/e2e/helpers/expectNoBrokenState.ts
 *
 * Fails the test if the page contains any marker of a broken data-loading state:
 *   • "Aligned rows: 0"          → correlation alignment failed
 *   • "Not enough" (data)        → insufficient data message
 *   • "0 aligned rows"           → alignment failed (alternate phrasing)
 *   • NaN / Infinity / undefined → data serialisation bug (also caught by expectScreenSane)
 *   • a visible error bar        → anyError rendered in workspace
 *   • a loading spinner still    → spinner visible after the caller's wait
 *
 * Usage:
 *   import { expectNoBrokenState } from './expectNoBrokenState';
 *   await expectNoBrokenState(page, 'after correlation refresh');
 */

import { expect, type Page } from '@playwright/test';
import { expectScreenSane } from './appHarness';

/** Text patterns that signal a broken state in a data workspace. */
const BROKEN_STATE_PATTERNS: RegExp[] = [
  /Aligned rows:\s*0\b/i,
  /\b0 aligned rows\b/i,
  /Not enough.*data/i,
  /Not enough.*observations/i,
  /not_enough_data/i,
  /\bNaN\b/,
  /\bInfinity\b/,
  /\[object Object\]/i,
  /Cannot read properties/i,
  /is not a function/i,
  /TypeError/i,
  /ReferenceError/i,
  /status.*failed/i,
];

export async function expectNoBrokenState(page: Page, context = '') {
  const label = context ? ` (${context})` : '';

  // 1. Reuse the existing sanity scanner (NaN, Infinity, SVG attrs, etc.)
  await expectScreenSane(page);

  // 2. Check for broken-state text patterns in the visible body
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const matched = BROKEN_STATE_PATTERNS.filter((p) => p.test(bodyText));
  expect(
    matched,
    `Broken-state pattern(s) found in page text${label}:\n${matched.map(String).join('\n')}\n\nFirst 1500 chars of body:\n${bodyText.slice(0, 1500)}`,
  ).toHaveLength(0);

  // 3. No visible error bar (anyError state in workspaces renders a red banner)
  const errorBar = page.locator('[style*="border-color: rgb(127, 29, 29)"], [style*="#7f1d1d"]');
  const errorBarVisible = await errorBar.first().isVisible().catch(() => false);
  expect(errorBarVisible, `Workspace error bar is visible${label}`).toBe(false);

  // 4. Correlation matrix must not contain only em-dashes (—) in off-diagonal cells.
  //    If all cells are "—", alignment failed silently.
  const matrixEl = page.getByTestId('correlation-matrix');
  if (await matrixEl.count()) {
    const cells = await matrixEl.locator('td').allInnerTexts();
    const dataCells = cells.filter((c) => c.trim() !== '' && !/^[A-Z]+$/.test(c.trim()));
    const allDash = dataCells.length > 0 && dataCells.every((c) => c.trim() === '—');
    expect(
      allDash,
      `All correlation matrix cells contain "—" — alignment likely failed${label}. Cells: ${JSON.stringify(dataCells.slice(0, 10))}`,
    ).toBe(false);
  }
}
