import { test, expect } from '@playwright/test';
import { attachNetworkGuards } from './helpers/networkGuards';
import { isKnownE2eMockedApiRequest, mockedApiBody } from './helpers/apiMocks';
import { bootApp, expectScreenSane, openDesktopWorkspace } from './helpers/appHarness';
import { desktopWorkspaces, requiredWorkspaceLabels, requiredWorkspaceNavLabels, workspaceById } from './helpers/workspaceData';


test('workspace metadata helper resolves canonical Macro id and legacy alias without duplicate entries', async () => {
  const canonical = workspaceById('MacroMultiAsset');
  const legacy = workspaceById('Macro');
  expect(canonical?.id).toBe('MacroMultiAsset');
  expect(legacy?.id).toBe('MacroMultiAsset');
  expect(requiredWorkspaceLabels(['MacroMultiAsset'])).toEqual(['Macro / Multi-Asset']);
  expect(requiredWorkspaceLabels(['Macro'])).toEqual(['Macro / Multi-Asset']);
  expect(desktopWorkspaces.filter((workspace) => /macro|multi-asset/i.test(workspace.label)).map((workspace) => workspace.id)).toEqual(['MacroMultiAsset']);
});

test('e2e API mock coverage: app boot has zero unmocked /api requests', async ({ page }) => {
  const guard = attachNetworkGuards(page);
  await bootApp(page);
  await expectScreenSane(page);
  const unmocked = guard.apiRequests.filter((request) => request.classification === 'unknown-unmocked-api-request');
  expect(unmocked).toEqual([]);
  guard.assertClean();
});

test('e2e API mock coverage: ML signal and alert routes used by production UI are deterministic', async () => {
  const urls = [
    'http://localhost:5173/api/ml/signal/SPY?timeframe=1m',
    'http://localhost:5173/api/ml/signal/BTC-USD?timeframe=1m',
    'http://localhost:5173/api/ml/signal/EURUSD%3DX?timeframe=1m',
    'http://localhost:5173/api/alerts/history?limit=10',
    'http://localhost:5173/api/alerts',
    'http://localhost:5173/api/alerts/diagnostics',
    'http://localhost:5173/api/alerts/history?limit=50',
  ];

  for (const url of urls) {
    expect(isKnownE2eMockedApiRequest('GET', url), url).toBe(true);
  }
});

test('chart/feed polling cleanup: switching away from Chart has no repeated aborted polling failures', async ({ page }) => {
  const guard = attachNetworkGuards(page);
  await bootApp(page);
  await openDesktopWorkspace(page, workspaceById('ChartOrderflow')!);
  await openDesktopWorkspace(page, workspaceById('LiveData')!);
  await openDesktopWorkspace(page, workspaceById('Portfolio')!);
  await page.waitForTimeout(500);
  const forbiddenAborts = guard.failures.filter((failure) => failure.classification === 'forbidden-aborted-request');
  expect(forbiddenAborts).toEqual([]);
  guard.assertClean();
});

test('workspace label consistency: required journey labels come from canonical registry metadata', async () => {
  const labels = requiredWorkspaceLabels(['HistoricalData', 'AILab', 'Backtesting', 'MacroMultiAsset', 'Portfolio', 'Risk']);
  const navLabels = requiredWorkspaceNavLabels(['HistoricalData', 'AILab', 'Backtesting', 'MacroMultiAsset', 'Portfolio', 'Risk']);
  expect(labels).toEqual(labels.map((label) => desktopWorkspaces.find((workspace) => workspace.label === label)?.label));
  expect(navLabels).toEqual(['Historical Data', 'AI Lab', 'Backtesting', 'Macro / Multi-Asset', 'Portfolio', 'Risk']);
});

test('mocked API routes: every known route returns non-empty valid JSON without NaN/Infinity/undefined and status < 400', async () => {
  const routes: Array<[string, string]> = [
    ['GET', '/api/auth/me'],
    ['GET', '/api/chart/payload/SPY'],
    ['GET', '/api/chart/cvd/SPY'],
    ['GET', '/api/chart/candles/SPY'],
    ['GET', '/api/chart/indicators/SPY'],
    ['GET', '/api/chart/overlays/SPY'],
    ['GET', '/api/chart/orderflow/SPY'],
    ['GET', '/api/chart/footprint/SPY'],
    ['GET', '/api/volume-profile/SPY'],
    ['GET', '/api/feeds/tick/SPY'],
    ['GET', '/api/feeds/candle/SPY'],
    ['GET', '/api/feeds/orderbook/SPY'],
    ['GET', '/api/feed/status'],
    ['GET', '/api/feeds/status'],
    ['GET', '/api/providers/health'],
    ['GET', '/api/providers/credentials'],
    ['GET', '/api/providers/active'],
    ['GET', '/api/historical/providers'],
    ['GET', '/api/historical/datasets'],
    ['GET', '/api/historical/datasets/e2e-dataset'],
    ['GET', '/api/historical/datasets/e2e-dataset/diagnostics'],
    ['POST', '/api/historical/download'],
    ['POST', '/api/historical/use-for-ml'],
    ['POST', '/api/historical/use-for-backtest'],
    ['POST', '/api/historical/use-for-correlation'],
    ['DELETE', '/api/historical/datasets/e2e-dataset'],
    ['GET', '/api/ml/dependencies'],
    ['GET', '/api/ml/model'],
    ['GET', '/api/ml/model-runs'],
    ['GET', '/api/ml/models'],
    ['GET', '/api/ml/predictions'],
    ['GET', '/api/ml/feature-importance'],
    ['GET', '/api/ml/drift'],
    ['GET', '/api/ml/model-card'],
    ['GET', '/api/ml/metrics'],
    ['GET', '/api/ml/worker/status'],
    ['GET', '/api/ml/health'],
    ['GET', '/api/ml/signal/SPY'],
    ['POST', '/api/ml/train'],
    ['POST', '/api/ml/infer/SPY'],
    ['POST', '/api/ml/promote/SPY'],
    ['GET', '/api/alerts'],
    ['GET', '/api/alerts/diagnostics'],
    ['GET', '/api/alerts/history'],
    ['POST', '/api/alerts'],
    ['GET', '/api/backtest/runs'],
    ['POST', '/api/backtest/run'],
    ['GET', '/api/macro/beta'],
    ['GET', '/api/multi-asset/beta'],
    ['GET', '/api/macro/correlation'],
    ['GET', '/api/multi-asset/correlation'],
    ['GET', '/api/macro/sector-rotation'],
    ['GET', '/api/multi-asset/sector-rotation'],
    ['GET', '/api/macro/volatility-heatmap'],
    ['GET', '/api/multi-asset/volatility'],
    ['GET', '/api/portfolio/summary'],
    ['GET', '/api/portfolio/positions'],
    ['GET', '/api/portfolio/pnl'],
    ['GET', '/api/portfolio/exposure'],
    ['GET', '/api/portfolio/drawdown'],
    ['GET', '/api/portfolio/history'],
    ['GET', '/api/portfolio/var'],
    ['POST', '/api/portfolio/stress-test'],
    ['GET', '/api/risk/summary'],
    ['GET', '/api/risk/limits'],
    ['GET', '/api/risk/var'],
    ['GET', '/api/risk/drawdown'],
    ['GET', '/api/risk/exposure'],
    ['GET', '/api/risk/alerts'],
    ['GET', '/api/oms/orders'],
    ['GET', '/api/execution/orders'],
    ['GET', '/api/ops/status'],
    ['GET', '/api/institutional/accounts'],
    ['GET', '/api/market/runtime'],
    ['GET', '/api/market/subscriptions'],
    ['GET', '/api/paper/positions'],
    ['GET', '/api/rules/list'],
    ['GET', '/api/strategy-lab/runs'],
  ];

  for (const [method, path] of routes) {
    const result = mockedApiBody(path, method);
    expect(result.known, `${method} ${path} must be a known mocked route`).toBe(true);
    const status = result.status ?? 200;
    expect(status, `${method} ${path} must not return 4xx/5xx (got ${status})`).toBeLessThan(400);
    const bodyStr = JSON.stringify(result.body);
    expect(bodyStr, `${method} ${path} must return non-empty JSON body`).toBeTruthy();
    expect(() => JSON.parse(bodyStr), `${method} ${path} must be valid JSON`).not.toThrow();
    expect(/\b(?:NaN|Infinity)\b/.test(bodyStr), `${method} ${path} must not contain NaN/Infinity`).toBe(false);
    expect(/"undefined"/.test(bodyStr), `${method} ${path} must not contain "undefined" string`).toBe(false);
  }
});

test('legacy Settings alias resolves to the canonical Operations workspace without duplicate entries', async ({ page }) => {
  const settings = workspaceById('Settings');
  expect(settings?.id).toBe('Ops');
  expect(settings?.label).toBe('Operations');
  expect(desktopWorkspaces.filter((workspace) => workspace.label === 'Operations')).toHaveLength(1);

  await bootApp(page, { viewport: { width: 390, height: 844 } });
  await page.getByTestId('mobile-more-workspaces').click();
  const moreDialog = page.getByRole('dialog', { name: /more workspaces/i });
  await expect(moreDialog).toBeVisible();
  await expect(moreDialog.getByRole('button', { name: settings!.ariaLabel || settings!.label, exact: true })).toBeVisible();
});
