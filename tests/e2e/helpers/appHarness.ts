import { expect, type Locator, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import { invalidTextPatterns } from './workspaceData';

export const resultsPath = (name: string) => name;

type BootAppOptions = {
  viewport?: { width: number; height: number };
};

export async function installAuthState(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('reversal_user_token', 'e2e-token');
    localStorage.setItem('reversal_user_profile', JSON.stringify({ id: 'e2e-user', email: 'e2e@example.com', name: 'E2E User' }));
  });
}

export async function installSafeApiMocks(page: Page) {
  const fulfillJson = (route: Route, body: unknown, status = 200) => route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  });

  await page.route('**/auth/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.includes('undefined') || path.includes('null') || path.includes('NaN')) {
      return fulfillJson(route, { error: { code: 'BAD_E2E_AUTH_REQUEST', message: 'Invalid generated auth path' } }, 400);
    }
    if (path === '/auth/me' || path === '/auth/check') {
      return fulfillJson(route, { user: { id: 'e2e-user', email: 'e2e@example.com', name: 'E2E User' } });
    }
    if (path === '/auth/login' || path === '/auth/register') {
      return fulfillJson(route, { token: 'e2e-token', user: { id: 'e2e-user', email: 'e2e@example.com', name: 'E2E User' } });
    }
    return fulfillJson(route, { ok: true });
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const json = (body: unknown, status = 200) => fulfillJson(route, body, status);

    if (path.includes('undefined') || path.includes('null') || path.includes('NaN')) {
      return json({ error: { code: 'BAD_E2E_REQUEST', message: 'Invalid generated API path' } }, 400);
    }
    if (path === '/api/auth/me') return json({ user: { id: 'e2e-user', email: 'e2e@example.com', name: 'E2E User' } });
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

async function collectBootDiagnostics(page: Page) {
  return page.evaluate(() => {
    const body = document.body;
    const attrs = (element: Element) => ({
      tagName: element.tagName.toLowerCase(),
      textContent: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 300),
      ariaLabel: element.getAttribute('aria-label') || '',
      title: element.getAttribute('title') || '',
      testId: element.getAttribute('data-testid') || '',
      className: typeof element.className === 'string' ? element.className : String(element.getAttribute('class') || ''),
    });

    return {
      currentUrl: window.location.href,
      title: document.title,
      readyState: document.readyState,
      bodyInnerText: (body?.innerText || '').slice(0, 3000),
      bodyInnerHTML: (body?.innerHTML || '').slice(0, 3000),
      buttons: Array.from(document.querySelectorAll('button')).map(attrs),
      testIds: Array.from(document.querySelectorAll('[data-testid]')).map((element) => ({
        ...attrs(element),
        id: element.id || '',
      })),
      landmarks: Array.from(document.querySelectorAll('nav, aside, dialog, [role="dialog"]')).map(attrs),
      markers: {
        rootExists: Boolean(document.querySelector('#root')),
        terminalShellExists: Boolean(document.querySelector('[data-testid="terminal-shell"]')),
        desktopWorkspaceNavExists: Boolean(document.querySelector('[data-testid="desktop-workspace-nav"]')),
        mobileWorkspaceNavExists: Boolean(document.querySelector('[data-testid="mobile-workspace-nav"]')),
      },
    };
  }).catch((error) => ({
    currentUrl: page.url(),
    title: '',
    readyState: 'unavailable',
    bodyInnerText: '',
    bodyInnerHTML: '',
    buttons: [],
    testIds: [],
    landmarks: [],
    markers: {
      rootExists: false,
      terminalShellExists: false,
      desktopWorkspaceNavExists: false,
      mobileWorkspaceNavExists: false,
    },
    collectionError: error instanceof Error ? error.message : String(error),
  }));
}

function diagnosticsMessage(context: string, diagnostics: Awaited<ReturnType<typeof collectBootDiagnostics>>) {
  const buttonLines = diagnostics.buttons
    .map((button) => [button.testId, button.ariaLabel, button.title, button.textContent, button.className].filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n') || '(none)';
  const testIdLines = diagnostics.testIds
    .map((element) => [element.testId, element.tagName, element.ariaLabel, element.title, element.textContent, element.className].filter(Boolean).join(' | '))
    .join('\n') || '(none)';
  const landmarkLines = diagnostics.landmarks
    .map((element) => [element.tagName, element.testId, element.ariaLabel, element.title, element.textContent, element.className].filter(Boolean).join(' | '))
    .join('\n') || '(none)';

  return `${context}
Current URL: ${diagnostics.currentUrl}
Document title: ${diagnostics.title || '(empty)'}
Document readyState: ${diagnostics.readyState}
Markers: ${JSON.stringify(diagnostics.markers)}

First 3000 chars of document.body.innerText:
${diagnostics.bodyInnerText || '(empty)'}

First 3000 chars of document.body.innerHTML:
${diagnostics.bodyInnerHTML || '(empty)'}

Buttons (data-testid | aria-label | title | text | className):
${buttonLines}

Elements with data-testid:
${testIdLines}

Nav/aside/dialog elements:
${landmarkLines}`;
}

function recordBootDiagnostics(context: string, diagnostics: Awaited<ReturnType<typeof collectBootDiagnostics>>) {
  const path = 'APP_CRAWLER_RESULTS.json';
  let previous: Record<string, unknown> = {};
  try {
    if (fs.existsSync(path)) previous = JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch {
    previous = {};
  }
  const bootDiagnostics = Array.isArray(previous.bootDiagnostics) ? previous.bootDiagnostics : [];
  bootDiagnostics.push({ context, generatedAt: new Date().toISOString(), ...diagnostics });
  fs.writeFileSync(path, JSON.stringify({ ...previous, bootDiagnostics }, null, 2));
}

export async function bootApp(page: Page, options: BootAppOptions = {}) {
  if (options.viewport) await page.setViewportSize(options.viewport);
  await installAuthState(page);
  await installSafeApiMocks(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const shell = page.getByTestId('terminal-shell');
  try {
    await expect(shell).toBeVisible();
    await expect(page.getByTestId('desktop-workspace-nav').or(page.getByTestId('mobile-workspace-nav'))).toBeVisible();
  } catch (error) {
    const diagnostics = await collectBootDiagnostics(page);
    const context = error instanceof Error ? error.message : String(error);
    recordBootDiagnostics(context, diagnostics);
    throw new Error(diagnosticsMessage(`Terminal shell boot failed: ${context}`, diagnostics));
  }
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
    className: typeof button.className === 'string' ? button.className : button.getAttribute('class') || '',
  })));
}

function navLabelsMessage(labels: Awaited<ReturnType<typeof availableNavigationLabels>>) {
  return labels
    .map((label) => [label.testId, label.ariaLabel, label.title, label.tooltip, label.text, label.className].filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n');
}

async function throwNavigationDiagnostic(page: Page, message: string, selector: string) {
  const labels = await availableNavigationLabels(page, selector);
  const diagnostics = await collectBootDiagnostics(page);
  recordBootDiagnostics(message, diagnostics);
  throw new Error(`${message}
Available navigation labels:
${navLabelsMessage(labels) || '(none)'}

${diagnosticsMessage('DOM diagnostics at navigation failure:', diagnostics)}`);
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

  await throwNavigationDiagnostic(
    page,
    `Unable to find desktop workspace navigation for ${workspace.id} (${workspace.label}). Tried data-testid=${testId}, names=${names.join(', ') || '(none)'}, shortLabel=${workspace.shortLabel || '(none)'}.`,
    'aside button, nav button, [role="dialog"] button'
  );
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
    await throwNavigationDiagnostic(
      page,
      `Unable to find mobile workspace ${workspace.id} (${workspace.label}) in visible primary nav, and More workspaces is not required/rendered. Tried data-testid=${testId}, names=${names.join(', ') || '(none)'}.`,
      'nav[aria-label="Mobile workspace navigation"] button, [role="dialog"] button'
    );
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

  await throwNavigationDiagnostic(
    page,
    `Unable to find mobile workspace navigation for ${workspace.id} (${workspace.label}). Tried data-testid=${testId}, names=${names.join(', ') || '(none)'}.`,
    'nav[aria-label="Mobile workspace navigation"] button, [role="dialog"] button'
  );
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
