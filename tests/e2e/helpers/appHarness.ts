import { expect, type Locator, type Page } from '@playwright/test';
import { invalidTextPatterns } from './workspaceData';

export const resultsPath = (name: string) => name;

export async function installAuthState(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('reversal_user_token', 'e2e-token');
    localStorage.setItem('reversal_user_profile', JSON.stringify({ id: 'e2e-user', email: 'e2e@example.com', name: 'E2E User' }));
  });
}

export async function installSafeApiMocks(page: Page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(body),
    });

    if (path.includes('undefined') || path.includes('null') || path.includes('NaN')) {
      return json({ error: { code: 'BAD_E2E_REQUEST', message: 'Invalid generated API path' } }, 400);
    }
    if (path === '/api/auth/me') return json({ user: { id: 'e2e-user', email: 'e2e@example.com' } });
    if (path.includes('/providers') || path.includes('/feeds') || path.includes('/feed')) return json({ ok: true, providers: [], statuses: [], enabledByProvider: {}, providerOrder: [], activeProviders: [] });
    if (path.includes('/historical')) return json({ ok: true, datasets: [], files: [], data: [], status: 'empty' });
    if (path.includes('/ml/model-runs')) return json({ ok: true, models: [], runs: [] });
    if (path.includes('/ml/model')) return json({ ok: true, model: null, champion: null });
    if (path.includes('/ml/infer')) return json({ ok: false, error: { code: 'NO_CHAMPION_MODEL', message: 'No champion model is available for inference.' } }, 422);
    if (path.includes('/ml/train')) return json({ ok: false, error: { code: 'DATASET_REQUIRED', message: 'Select a valid historical dataset before training.' } }, 422);
    if (path.includes('/ml/promote')) return json({ ok: false, error: { code: 'MODEL_REQUIRED', message: 'Select a model before promotion.' } }, 422);
    if (path.includes('/ml')) return json({ ok: true, data: [], features: [], drift: [], metrics: {} });
    if (path.includes('/backtest') || path.includes('/correlation') || path.includes('/beta')) return json({ ok: true, result: null, rows: [] });
    if (method === 'DELETE') return json({ ok: true });
    return json({ ok: true, data: [], rows: [], items: [], status: 'ok' });
  });
}

export async function bootApp(page: Page) {
  await installAuthState(page);
  await installSafeApiMocks(page);
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(300);
}

type WorkspaceNavTarget = {
  id: string;
  label: string;
  shortLabel?: string;
  ariaLabel?: string;
  navTestId?: string;
  mobilePrimary?: boolean;
};

const workspaceTestId = (workspace: WorkspaceNavTarget) => workspace.navTestId ?? `workspace-nav-${workspace.id.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;

async function availableNavigationLabels(page: Page, selector = 'button') {
  return page.locator(selector).evaluateAll((buttons) => buttons.map((button) => ({
    text: (button.textContent || '').trim().replace(/\s+/g, ' '),
    ariaLabel: button.getAttribute('aria-label') || '',
    title: button.getAttribute('title') || '',
    testId: button.getAttribute('data-testid') || '',
    tooltip: button.getAttribute('data-tooltip') || '',
  })));
}

function navLabelsMessage(labels: Awaited<ReturnType<typeof availableNavigationLabels>>) {
  return labels
    .map((label) => [label.testId, label.ariaLabel, label.title, label.tooltip, label.text].filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n');
}

async function clickIfReady(locator: Locator) {
  if (await locator.count()) {
    const first = locator.first();
    if (await first.isVisible().catch(() => false)) {
      await first.click();
      return true;
    }
  }
  return false;
}

export async function openDesktopWorkspace(page: Page, workspace: WorkspaceNavTarget) {
  const testId = workspaceTestId(workspace);
  const names = [workspace.ariaLabel, workspace.label].filter(Boolean) as string[];

  if (await clickIfReady(page.getByTestId(testId))) {
    await page.waitForTimeout(250);
    return;
  }

  for (const name of names) {
    if (await clickIfReady(page.getByRole('button', { name, exact: true }))) {
      await page.waitForTimeout(250);
      return;
    }
  }

  for (const name of names) {
    if (await clickIfReady(page.locator(`button[title="${name}"], button[data-tooltip="${name}"]`))) {
      await page.waitForTimeout(250);
      return;
    }
  }

  if (workspace.shortLabel && await clickIfReady(page.getByRole('button', { name: workspace.shortLabel, exact: true }))) {
    await page.waitForTimeout(250);
    return;
  }

  const labels = await availableNavigationLabels(page, 'aside button, nav button, [role="dialog"] button');
  throw new Error(`Unable to find desktop workspace navigation for ${workspace.id} (${workspace.label}). Tried data-testid=${testId}, names=${names.join(', ') || '(none)'}, shortLabel=${workspace.shortLabel || '(none)'}.
Available navigation labels:
${navLabelsMessage(labels) || '(none)'}`);
}

export async function openMobileWorkspace(page: Page, workspace: WorkspaceNavTarget) {
  const testId = workspaceTestId(workspace);
  const names = [workspace.ariaLabel, workspace.label].filter(Boolean) as string[];

  if (await clickIfReady(page.getByTestId(testId))) {
    await page.waitForTimeout(250);
    return;
  }

  for (const name of names) {
    if (await clickIfReady(page.getByRole('button', { name, exact: true }))) {
      await page.waitForTimeout(250);
      return;
    }
  }

  const moreButton = page.getByTestId('mobile-more-workspaces');
  if (await moreButton.count()) {
    await moreButton.first().click();
    await expect(page.getByRole('dialog', { name: /more workspaces/i })).toBeVisible();
  } else {
    const labels = await availableNavigationLabels(page, 'nav[aria-label="Mobile workspace navigation"] button, [role="dialog"] button');
    throw new Error(`Unable to find mobile workspace ${workspace.id} (${workspace.label}) in visible primary nav, and More workspaces is not required/rendered. Tried data-testid=${testId}, names=${names.join(', ') || '(none)'}.
Available mobile navigation labels:
${navLabelsMessage(labels) || '(none)'}`);
  }

  if (await clickIfReady(page.getByTestId(testId))) {
    await page.waitForTimeout(250);
    return;
  }

  for (const name of names) {
    if (await clickIfReady(page.getByRole('button', { name, exact: true }))) {
      await page.waitForTimeout(250);
      return;
    }
  }

  const labels = await availableNavigationLabels(page, 'nav[aria-label="Mobile workspace navigation"] button, [role="dialog"] button');
  throw new Error(`Unable to find mobile workspace navigation for ${workspace.id} (${workspace.label}). Tried data-testid=${testId}, names=${names.join(', ') || '(none)'}.
Available mobile navigation labels:
${navLabelsMessage(labels) || '(none)'}`);
}

export async function scanVisibleInvalidValues(page: Page) {
  const text = await page.locator('body').innerText().catch(() => '');
  const invalidText = invalidTextPatterns.filter((pattern) => pattern.test(text)).map(String);
  const invalidSvgAttrs = await page.locator('svg *').evaluateAll((nodes) => {
    const bad: string[] = [];
    for (const node of nodes) {
      for (const attr of Array.from(node.attributes || [])) {
        if (/\b(?:NaN|Infinity|undefined)\b/i.test(attr.value)) bad.push(`${node.tagName}.${attr.name}=${attr.value}`);
      }
    }
    return bad;
  }).catch(() => [] as string[]);
  return { text, invalidText, invalidSvgAttrs };
}

export async function expectScreenSane(page: Page) {
  const sanity = await scanVisibleInvalidValues(page);
  expect(sanity.invalidText, `invalid visible text in screen:\n${sanity.text.slice(0, 2000)}`).toEqual([]);
  expect(sanity.invalidSvgAttrs, 'invalid SVG/chart attributes').toEqual([]);
}
