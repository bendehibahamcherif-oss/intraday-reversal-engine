/**
 * Application test harness.
 *
 * Combines:
 *  - API mock installation (deterministic, no real backend)
 *  - Auth bypass via localStorage injection
 *  - Network guard installation
 *  - Page navigation to a given workspace
 *
 * Usage:
 *   const harness = await setupHarness(page);
 *   await harness.goto('Risk');
 *   // ... interact ...
 *   harness.assertClean();
 */
import { Page } from '@playwright/test';
import { setupApiMocks } from './apiMocks.js';
import { installNetworkGuards, assertNoViolations, GuardViolation } from './networkGuards.js';

const AUTH_PROFILE = {
  id:    '1',
  email: 'e2e@test.local',
  name:  'E2E User',
  token: 'e2e-token',
  role:  'admin',
};

export interface AppHarness {
  violations: GuardViolation[];
  unmocked:   string[];
  goto(workspace: string): Promise<void>;
  assertClean(context?: string): void;
}

export async function setupHarness(page: Page): Promise<AppHarness> {
  const violations: GuardViolation[] = [];
  let unmockedRef: string[]           = [];

  // Install guards BEFORE any navigation so we capture everything.
  installNetworkGuards(page, violations);

  // Inject auth into localStorage before the app boots.
  await page.addInitScript((profile) => {
    localStorage.setItem('reversal_user_profile', JSON.stringify(profile));
    // Disable demo-mode flag so the app hits real (mocked) API routes.
    localStorage.removeItem('fallback_demo');
  }, AUTH_PROFILE);

  // Install API mocks.
  const { unmocked } = await setupApiMocks(page);
  unmockedRef = unmocked;

  async function goto(workspace: string) {
    await page.goto('/');
    // Navigate via the workspace store selector if workspace is provided.
    if (workspace) {
      await page.evaluate((ws) => {
        // Directly set workspace in Zustand persisted store.
        try {
          const raw = localStorage.getItem('reversal-workspace');
          const parsed = raw ? JSON.parse(raw) : {};
          localStorage.setItem('reversal-workspace', JSON.stringify({ ...parsed, state: { workspace: ws } }));
        } catch {}
      }, workspace);
      await page.reload();
    }
    // Wait for the app shell to be rendered.
    await page.waitForSelector('[data-testid="app-shell"], #root > *, main, [class*="terminal"]', {
      timeout: 10_000,
    });
  }

  function assertClean(context?: string) {
    assertNoViolations(violations, context);
  }

  return { violations, unmocked: unmockedRef, goto, assertClean };
}

/**
 * Lighter helper: just navigate to a URL and wait for load.
 */
export async function gotoAndWait(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState('networkidle', { timeout: 15_000 });
}
