/**
 * Deterministic API mock catalog.
 *
 * Every route the production UI may call is covered here so tests run
 * without a real backend. Unknown routes are recorded and the test suite
 * will fail when uncovered routes are accessed.
 */
import { Page, Route, Request } from '@playwright/test';

// ── Response helpers ──────────────────────────────────────────────────────────

function ok(body: object = {}) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ...body }) };
}

function empty(extra: object = {}) {
  return ok({ data: null, ...extra });
}

// ── Catalog ───────────────────────────────────────────────────────────────────

type RouteEntry = {
  pattern: RegExp;
  method?: string;
  response: (url: string) => { status: number; contentType: string; body: string };
};

const CATALOG: RouteEntry[] = [
  // ── Auth ────────────────────────────────────────────────────────────────────
  { pattern: /\/auth\/login$/,   method: 'POST', response: () => ok({ token: 'e2e-token', user: { id: '1', email: 'e2e@test.local', name: 'E2E User' } }) },
  { pattern: /\/auth\/register$/, method: 'POST', response: () => ok({ token: 'e2e-token', user: { id: '1', email: 'e2e@test.local', name: 'E2E User' } }) },
  { pattern: /\/auth\/me$/,       response: () => ok({ user: { id: '1', email: 'e2e@test.local', name: 'E2E User' } }) },
  { pattern: /\/auth\/check$/,    response: () => ok({ authenticated: true }) },

  // ── Admin / settings ────────────────────────────────────────────────────────
  { pattern: /\/admin\/users/, response: () => ok({ users: [] }) },
  { pattern: /\/settings\//,   response: () => ok({ value: null }) },
  { pattern: /\/intelligence\/events/, response: () => ok({ events: [] }) },

  // ── Alerts ──────────────────────────────────────────────────────────────────
  { pattern: /\/api\/alerts\/diagnostics/, response: () => ok({ diagnostics: {}, workerAlive: true }) },
  { pattern: /\/api\/alerts\/history/,     response: () => ok({ history: [], count: 0 }) },
  { pattern: /\/api\/alerts$/,             response: () => ok({ alerts: [], count: 0 }) },
  { pattern: /\/api\/alerts\?/,            response: () => ok({ alerts: [], count: 0 }) },
  { pattern: /\/api\/alerts\/[^/]+\/disable/, method: 'POST', response: () => ok() },
  { pattern: /\/api\/alerts\/[^/]+\/enable/,  method: 'POST', response: () => ok() },
  { pattern: /\/api\/alerts\/[^/]+$/,         response: () => ok({ alert: null }) },

  // ── Chart data ──────────────────────────────────────────────────────────────
  { pattern: /\/api\/chart\/candles\//,    response: () => ok({ candles: [], symbol: 'SPY', timeframe: '1m' }) },
  { pattern: /\/api\/chart\/payload\//,    response: () => ok({ candles: [], symbol: 'SPY' }) },
  { pattern: /\/api\/chart\/overlays\//,   response: () => ok({ overlays: [] }) },
  { pattern: /\/api\/chart\/indicators\//, response: () => ok({ indicators: [] }) },
  { pattern: /\/api\/chart\/orderflow\//,  response: () => ok({ orderflow: null }) },
  { pattern: /\/api\/chart\/footprint\//,  response: () => ok({ footprint: null }) },
  { pattern: /\/api\/chart\/cvd\//,        response: () => ok({ cvd: [] }) },

  // ── Yahoo chart ─────────────────────────────────────────────────────────────
  { pattern: /\/yahoo\/chart\//,           response: () => ok({ chart: { result: [] } }) },

  // ── Feed / providers ────────────────────────────────────────────────────────
  { pattern: /\/api\/feed\/status$/,           response: () => ok({ status: 'idle', source: 'yahoo', runtimeStatus: 'delayed', activeProviders: ['yahoo'] }) },
  { pattern: /\/api\/feeds\/tick\//,           response: () => ok({ tick: null, symbol: 'SPY' }) },
  { pattern: /\/api\/feeds\/candle\//,         response: () => ok({ candle: null, symbol: 'SPY' }) },
  { pattern: /\/api\/feeds\/orderbook\//,      response: () => ok({ bids: [], asks: [], symbol: 'SPY' }) },
  { pattern: /\/api\/providers\/health$/,      response: () => ok({ providers: [] }) },
  { pattern: /\/api\/providers\/credentials$/, response: () => ok({ credentials: {} }) },
  { pattern: /\/api\/providers\/credentials\//,response: () => ok({ status: 'not_configured' }) },
  { pattern: /\/api\/providers\/active$/,      response: () => ok({ activeProviders: ['yahoo'], providerOrder: ['yahoo'] }) },

  // ── Market runtime ──────────────────────────────────────────────────────────
  { pattern: /\/api\/runtime\/health$/,      response: () => ok({ status: 'healthy' }) },

  // ── Historical data ──────────────────────────────────────────────────────────
  { pattern: /\/api\/historical\/providers$/, response: () => ok({ providers: [{ id: 'yahoo', label: 'Yahoo Finance', available: true }] }) },
  { pattern: /\/api\/historical\/datasets\/[^/]+\/diagnostics/, response: (url) => {
    const id = url.match(/\/datasets\/([^/]+)\/diagnostics/)?.[1] || 'unknown';
    return ok({ datasetId: id, registryFound: true, fileExists: true, usableForMl: true, issues: [] });
  }},
  { pattern: /\/api\/historical\/datasets\/[^/?]+$/, response: (url) => {
    const id = url.match(/\/datasets\/([^/?]+)/)?.[1] || 'unknown';
    return ok({ dataset: { datasetId: id, symbols: ['SPY'], rowCount: 251, status: 'ready', fileExists: true } });
  }},
  { pattern: /\/api\/historical\/datasets/, response: () => ok({ datasets: [] }) },
  { pattern: /\/api\/historical\/download/, method: 'POST', response: () => ok({ datasetId: 'hist_SPY_1d_RTH_e2e', status: 'ready', rowCount: 251 }) },

  // ── ML lifecycle (canonical /api/ml/*) ──────────────────────────────────────
  { pattern: /\/api\/ml\/health$/, response: () => ok({ status: 'healthy', workerAlive: true, workerStatus: 'idle', model: null }) },
  { pattern: /\/api\/ml\/model\b/, response: () => ok({ champion: null, challengers: [], status: 'no_model', models: [] }) },
  { pattern: /\/api\/ml\/model-runs/, response: () => ok({ runs: [], activeJobs: [], count: 0 }) },
  { pattern: /\/api\/ml\/predictions/, response: () => ok({ predictions: [], count: 0, total: 0 }) },
  { pattern: /\/api\/ml\/feature-importance/, response: () => ok({ features: [], modelVersion: null, ok: true }) },
  { pattern: /\/api\/ml\/drift$/, response: () => ok({ drift: { psi: {}, status: 'not_enough_data', features: [], detectedAt: null } }) },
  { pattern: /\/api\/ml\/model-card/, response: () => ok({ card: null, status: 'no_model' }) },
  { pattern: /\/api\/ml\/metrics$/, response: () => ok({ workerStatus: 'idle', workerAlive: false, totalRequests: 0, errors: 0, restarts: 0, pendingCount: 0 }) },
  { pattern: /\/api\/ml\/worker\/status/, response: () => ok({ status: 'idle', alive: false }) },
  { pattern: /\/api\/ml\/models/, response: () => ok({ models: [], champion: null, status: 'no_model' }) },
  { pattern: /\/api\/ml\/dependencies/, response: () => ok({ dependencies: [], allMet: true }) },

  // ML features & labels (used by mlSignalStore and AILab)
  { pattern: /\/api\/ml\/features\/[^/?]+/, response: (url) => {
    const sym = url.match(/\/features\/([^/?]+)/)?.[1]?.toUpperCase() || 'SPY';
    return ok({ symbol: sym, features: [], rows: [], count: 0, status: 'ready', message: 'No feature rows in e2e mock.' });
  }},
  { pattern: /\/api\/ml\/labels\/[^/?]+/, response: (url) => {
    const sym = url.match(/\/labels\/([^/?]+)/)?.[1]?.toUpperCase() || 'SPY';
    return ok({ symbol: sym, labels: [], rows: [], count: 0, status: 'ready', message: 'No label rows in e2e mock.' });
  }},
  { pattern: /\/api\/ml\/signal\/[^/?]+/, response: (url) => {
    const sym = url.match(/\/signal\/([^/?]+)/)?.[1]?.toUpperCase() || 'SPY';
    return ok({ signal: null, symbol: sym, status: 'no_signal' });
  }},
  { pattern: /\/api\/ml\/infer\/[^/?]+/, method: 'POST', response: (url) => {
    const sym = url.match(/\/infer\/([^/?]+)/)?.[1]?.toUpperCase() || 'SPY';
    return ok({ inference: null, status: 'no_champion', message: 'No champion model.', symbol: sym });
  }},
  { pattern: /\/api\/ml\/train$/, method: 'POST', response: () => ok({ status: 'queued', jobId: 'e2e-job-1' }) },
  { pattern: /\/api\/ml\/promote\//, method: 'POST', response: () => ok({ status: 'promoted', modelId: 'e2e-model-1' }) },

  // ── AI Lab legacy analytics routes ──────────────────────────────────────────
  { pattern: /\/api\/ai\/features\/save\//, method: 'POST', response: () => ok() },
  { pattern: /\/api\/ai\/features\/record\//, response: () => ok({ record: null }) },
  { pattern: /\/api\/ai\/features\/record\//, method: 'DELETE', response: () => ok() },
  { pattern: /\/api\/ai\/features\/[^/?]+\?/, response: (url) => {
    const sym = url.match(/\/features\/([^/?]+)/)?.[1]?.toUpperCase() || 'SPY';
    return ok({ symbol: sym, features: [], rows: [], count: 0 });
  }},
  { pattern: /\/api\/ai\/features\/[^/?]+$/, response: () => ok({ features: [] }) },
  { pattern: /\/api\/ai\/labels\/record\//, method: 'POST', response: () => ok() },
  { pattern: /\/api\/ai\/labels\/symbol\//, method: 'POST', response: () => ok() },
  { pattern: /\/api\/ai\/labels\/[^/?]+\?/, response: (url) => {
    const sym = url.match(/\/labels\/([^/?]+)/)?.[1]?.toUpperCase() || 'SPY';
    return ok({ symbol: sym, labels: [], rows: [], count: 0 });
  }},
  { pattern: /\/api\/ai\/labels\/[^/?]+$/, method: 'DELETE', response: () => ok() },
  { pattern: /\/api\/ai\/regime\//, response: () => ok({ regime: null, symbol: 'SPY' }) },
  { pattern: /\/api\/ai\/analytics\/analyze\//, method: 'POST', response: () => ok({ status: 'done' }) },
  { pattern: /\/api\/ai\/analytics\/features\//, response: () => ok({ features: [] }) },
  { pattern: /\/api\/ai\/analytics\/regimes\//, response: () => ok({ regimes: [] }) },
  { pattern: /\/api\/ai\/analytics\/[^/?]+$/, response: () => ok({ analytics: null }) },
  { pattern: /\/api\/ai\/analytics\/[^/?]+/, method: 'DELETE', response: () => ok() },

  // ── Backtest ─────────────────────────────────────────────────────────────────
  { pattern: /\/api\/backtest\/run$/, method: 'POST', response: () => ok({ status: 'completed', results: [], metrics: null, resultId: 'e2e-bt-1' }) },
  { pattern: /\/api\/backtest\/results\/[^/]+\/[^/]+\/report/, response: () => ok({ report: null }) },
  { pattern: /\/api\/backtest\/results\/[^/]+\/[^/?]+$/, response: () => ok({ result: null }) },
  { pattern: /\/api\/backtest\/results\/[^/?]+$/, response: () => ok({ results: [], count: 0 }) },
  { pattern: /\/api\/backtest\/monte-carlo\//, response: () => ok({ paths: [], summary: null }) },
  { pattern: /\/api\/backtest\/walk-forward\//, response: () => ok({ windows: [], summary: null }) },

  // ── Multi-asset / Macro ──────────────────────────────────────────────────────
  { pattern: /\/api\/multi-asset\/correlation/, response: () => ok({ correlation: null, matrix: {}, symbols: [], window: 20 }) },
  { pattern: /\/api\/multi-asset\/beta/,         response: () => ok({ beta: null, r2: null, symbol: 'QQQ', benchmark: 'SPY', window: 20 }) },
  { pattern: /\/api\/multi-asset\/sector-rotation/, response: () => ok({ rotation: [], summary: null }) },
  { pattern: /\/api\/multi-asset\/volatility/,   response: () => ok({ volatility: {}, symbols: [] }) },

  // ── Portfolio / Risk ─────────────────────────────────────────────────────────
  { pattern: /\/api\/portfolio\/positions/,   response: () => ok({ positions: [], count: 0 }) },
  { pattern: /\/api\/portfolio\/pnl/,         response: () => ok({ pnl: 0, unrealized: 0, realized: 0 }) },
  { pattern: /\/api\/portfolio\/summary/,     response: () => ok({ equity: 100000, positions: 0 }) },
  { pattern: /\/api\/portfolio\/history/,     response: () => ok({ history: [] }) },
  { pattern: /\/api\/portfolio\/exposure/,    response: () => ok({ exposure: 0, gross: 0, net: 0 }) },
  { pattern: /\/api\/portfolio\/var/,         response: () => ok({ var: null, es: null, confidence: 0.95 }) },
  { pattern: /\/api\/portfolio\/drawdown/,    response: () => ok({ current: 0, max: 0, series: [] }) },
  { pattern: /\/api\/portfolio\/stress-test/, response: () => ok({ scenarios: [] }) },
  { pattern: /\/api\/risk\/alerts/,           response: () => ok({ alerts: [], killSwitchActive: false }) },
  { pattern: /\/api\/risk\/var/,              response: () => ok({ var: null, es: null }) },
  { pattern: /\/api\/risk\/summary/,          response: () => ok({ summary: null }) },
  { pattern: /\/api\/risk\/exposure/,         response: () => ok({ exposure: 0 }) },
  { pattern: /\/api\/risk\/drawdown/,         response: () => ok({ current: 0, max: 0 }) },
  { pattern: /\/api\/risk\/limits/,           response: () => ok({ limits: [] }) },
  { pattern: /\/api\/paper\/risk\/status/,    response: () => ok({ killSwitchActive: false }) },
  { pattern: /\/api\/paper\/risk\/kill-switch/, method: 'POST', response: () => ok() },
  { pattern: /\/api\/paper\/reset/,           method: 'POST', response: () => ok() },

  // ── Execution ────────────────────────────────────────────────────────────────
  { pattern: /\/api\/execution\/orders/,       response: () => ok({ orders: [], count: 0 }) },
  { pattern: /\/api\/execution\/fills/,        response: () => ok({ fills: [], count: 0 }) },
  { pattern: /\/api\/execution\/analytics/,    response: () => ok({ analytics: null }) },
  { pattern: /\/api\/execution\/risk-check/,   response: () => ok({ allowed: true }) },
  { pattern: /\/api\/execution\/order$/,       method: 'POST', response: () => ok({ orderId: 'e2e-order-1', status: 'pending' }) },
  { pattern: /\/api\/execution\/order\/[^/]+/, response: () => ok({ order: null }) },

  // ── OMS ──────────────────────────────────────────────────────────────────────
  { pattern: /\/api\/oms\/reconciliation/,    response: () => ok({ reconciliation: null }) },
  { pattern: /\/api\/oms\/stats/,             response: () => ok({ stats: {} }) },
  { pattern: /\/api\/oms\/orders$/,           response: () => ok({ orders: [], count: 0 }) },
  { pattern: /\/api\/oms\/orders\?/,          response: () => ok({ orders: [], count: 0 }) },
  { pattern: /\/api\/oms\/orders\/[^/]+\/events/, response: () => ok({ events: [] }) },
  { pattern: /\/api\/oms\/orders\/[^/?]+$/,   response: () => ok({ order: null }) },

  // ── Quant / Strategy ─────────────────────────────────────────────────────────
  { pattern: /\/api\/quant\/extract\//,   method: 'POST', response: () => ok({ features: [] }) },
  { pattern: /\/api\/quant\/features\//,  response: () => ok({ features: [] }) },
  { pattern: /\/api\/quant\/history\/snapshot\//, response: () => ok({ snapshot: null }) },
  { pattern: /\/api\/quant\/history\//,   response: () => ok({ history: [] }) },
  { pattern: /\/api\/quant\/pipeline\//,  response: () => ok({ pipeline: null }) },
  { pattern: /\/api\/analytics\/compare\//, response: () => ok({ comparison: null }) },
  { pattern: /\/api\/analytics\/latest\//,  response: () => ok({ latest: null }) },
  { pattern: /\/api\/analytics\/trend\//,   response: () => ok({ trend: [] }) },
  { pattern: /\/api\/alpha\/analyze\//,     response: () => ok({ analysis: null }) },
  { pattern: /\/api\/alpha\/signals\//,     response: () => ok({ signals: [] }) },
  { pattern: /\/api\/patterns\/analyze\//,  response: () => ok({ patterns: [] }) },
  { pattern: /\/api\/patterns\/signals\//,  response: () => ok({ signals: [] }) },
  { pattern: /\/api\/reversals\/detect\//,  response: () => ok({ reversals: [] }) },
  { pattern: /\/api\/reversals\/points\//,  response: () => ok({ points: [] }) },
  { pattern: /\/api\/reversals\/strategy\//,response: () => ok({ strategy: null }) },
  { pattern: /\/api\/reversals\/save-strategy\//, method: 'POST', response: () => ok() },
  { pattern: /\/api\/validation\/strategy\//, method: 'POST', response: () => ok({ valid: true }) },
  { pattern: /\/api\/validation\/results\/[^/]+\/[^/?]+$/, response: () => ok({ result: null }) },
  { pattern: /\/api\/validation\/results\/[^/?]+$/, response: () => ok({ results: [] }) },
  { pattern: /\/api\/strategies\/generate\//, method: 'POST', response: () => ok({ strategies: [] }) },
  { pattern: /\/api\/strategies\/candidates\//, response: () => ok({ candidates: [] }) },
  { pattern: /\/api\/templates\/strategies\/[^/?]+\/create-rule-set/, method: 'POST', response: () => ok() },
  { pattern: /\/api\/templates\/strategies\/[^/?]+$/, response: () => ok({ template: null }) },
  { pattern: /\/api\/templates\/strategies/, response: () => ok({ templates: [] }) },
  { pattern: /\/api\/rules\/sets\//,       response: () => ok({ sets: [] }) },
  { pattern: /\/api\/rules\/set\/[^/]+$/,  response: () => ok({ rules: [] }) },
  { pattern: /\/api\/rules\/evaluate\//,   method: 'POST', response: () => ok({ result: null }) },
  { pattern: /\/api\/rules\/convert\//,    method: 'POST', response: () => ok() },

  // ── Quality / volume profile ──────────────────────────────────────────────
  { pattern: /\/api\/quality\/scores?\//,       response: () => ok({ score: null }) },
  { pattern: /\/api\/volume-profile\//,         response: () => ok({ profile: null }) },

  // ── Replay ───────────────────────────────────────────────────────────────────
  { pattern: /\/api\/replay-legacy\/candles\//, response: () => ok({ candles: [], timeframeStatus: '' }) },
  { pattern: /\/api\/replay\/start$/,  method: 'POST', response: () => ok() },
  { pattern: /\/api\/replay\/stop$/,   method: 'POST', response: () => ok() },
  { pattern: /\/api\/replay\/pause$/,  method: 'POST', response: () => ok() },
  { pattern: /\/api\/replay\/resume$/, method: 'POST', response: () => ok() },

  // ── Institutional ────────────────────────────────────────────────────────────
  { pattern: /\/api\/institutional\/analysis/, method: 'POST', response: () => ok() },
  { pattern: /\/api\/institutional\/scenarios/, method: 'POST', response: () => ok() },
  { pattern: /\/api\/institutional\/audit/, response: () => ok({ entries: [] }) },

  // ── Ops ───────────────────────────────────────────────────────────────────────
  { pattern: /\/api\/ops\/status/, response: () => ok({ status: 'healthy', components: [] }) },
];

// ── Installer ─────────────────────────────────────────────────────────────────

/**
 * Install all route mocks and a catch-all for any unregistered /api/* request.
 * Unregistered routes are fulfilled with a safe 200 but also appended to the
 * returned `unmocked` array so tests can assert coverage.
 */
export async function setupApiMocks(page: Page): Promise<{ unmocked: string[] }> {
  const unmocked: string[] = [];

  // Install specific route handlers (first match wins in Playwright).
  for (const entry of CATALOG) {
    await page.route(
      (url) => entry.pattern.test(url.href) && (!entry.method || entry.method === 'GET'),
      (route: Route) => {
        const r = entry.response(route.request().url());
        route.fulfill(r);
      },
    );
    // POST / DELETE variants
    if (entry.method && entry.method !== 'GET') {
      await page.route(
        (url) => entry.pattern.test(url.href),
        (route: Route) => {
          if (route.request().method() === entry.method) {
            const r = entry.response(route.request().url());
            route.fulfill(r);
          } else {
            route.continue();
          }
        },
      );
    }
  }

  // Catch-all: any remaining /api/* or non-HTML request that was not matched.
  await page.route(
    (url) => url.href.includes('/api/') && !url.href.includes('localhost:4173'),
    (route: Route) => {
      const url = route.request().url();
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      unmocked.push(`${route.request().method()} ${path}`);
      // Return a safe empty response so the app does not crash on unmatched routes.
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: 'empty' }) });
    },
  );

  return { unmocked };
}
