import type { Page, Route } from '@playwright/test';

const E2E_MOCK_HEADER = 'x-e2e-api-mock';
const BAD_URL_TOKENS = /(?:undefined|null|NaN)/i;

const iso = '2026-01-02T14:30:00.000Z';
const symbolFromPath = (path: string) => decodeURIComponent(path.split('/').filter(Boolean).pop() || 'SPY').toUpperCase();
const candles = Array.from({ length: 30 }, (_, index) => {
  const close = 470 + index * 0.25;
  return {
    time: new Date(Date.UTC(2026, 0, 2, 14, index)).toISOString(),
    timestamp: Date.UTC(2026, 0, 2, 14, index),
    open: close - 0.1,
    high: close + 0.4,
    low: close - 0.5,
    close,
    volume: 1000 + index * 25,
  };
});

function json(body: unknown, status = 200) {
  return { status, contentType: 'application/json; charset=utf-8', headers: { [E2E_MOCK_HEADER]: 'true' }, body: JSON.stringify(body) };
}

function chartPayload(path: string) {
  const symbol = symbolFromPath(path);
  return {
    ok: true,
    symbol,
    timeframe: '1m',
    status: 'rest_fallback',
    source: 'e2e_mock',
    candles,
    overlays: { vwap: candles.map((c) => ({ time: c.time, value: c.close - 0.05 })) },
    indicators: { ema9: candles.map((c) => ({ time: c.time, value: c.close - 0.03 })) },
    orderflow: { delta: 0, imbalance: [] },
  };
}

function cvd(path: string) {
  return { ok: true, symbol: symbolFromPath(path), status: 'rest_fallback', series: candles.map((c, i) => ({ time: c.time, timestamp: c.timestamp, value: i * 125 - 300 })) };
}

function volumeProfile(path: string) {
  const symbol = symbolFromPath(path);
  return {
    ok: true,
    symbol,
    status: 'rest_fallback',
    bins: Array.from({ length: 12 }, (_, i) => ({ price: 468 + i * 0.5, volume: 500 + i * 40, buyVolume: 260 + i * 20, sellVolume: 240 + i * 20 })),
    levels: Array.from({ length: 12 }, (_, i) => ({ price: 468 + i * 0.5, volume: 500 + i * 40 })),
    poc: 471,
    valueAreaHigh: 473,
    valueAreaLow: 469,
  };
}

const tick = (path: string) => ({ ok: true, status: 'rest_fallback', delayed: true, symbol: symbolFromPath(path), tick: { symbol: symbolFromPath(path), price: 472.25, bid: 472.2, ask: 472.3, size: 100, timestamp: iso } });
const candle = (path: string) => ({ ok: true, status: 'rest_fallback', delayed: true, symbol: symbolFromPath(path), candle: candles.at(-1), candles: candles.slice(-5) });
const orderbook = (path: string) => ({ ok: true, status: 'rest_fallback', delayed: true, symbol: symbolFromPath(path), orderbook: { bids: [[472.2, 100], [472.1, 120]], asks: [[472.3, 95], [472.4, 110]], timestamp: iso } });

const providersHealth = { ok: true, status: 'available', providers: [], statuses: [], enabledByProvider: {}, providerOrder: [], activeProviders: [], health: [] };
const credentials = { ok: true, credentials: [], providers: [], configured: {}, status: 'empty' };
const historicalDataset = { datasetId: 'e2e-dataset', id: 'e2e-dataset', symbols: ['SPY'], rowCount: 500, fileStatus: 'ready', fileExists: true, status: 'ready' };

function mlBody(path: string, method: string) {
  if (path === '/api/ml/dependencies') return { ok: true, status: 'available', dependencies: { xgboost: false, sklearn: false }, unavailable: ['xgboost'], mode: 'e2e_mock' };
  if (path === '/api/ml/model') return { ok: true, champion: null, challengers: [], model: null, status: 'no_model' };
  if (path === '/api/ml/model-runs' || path === '/api/ml/models') return { ok: true, runs: [], models: [], status: 'empty' };
  if (path === '/api/ml/predictions') return { ok: true, predictions: [], status: 'empty' };
  if (path === '/api/ml/feature-importance') return { ok: true, features: [], importance: [], status: 'no_model' };
  if (path === '/api/ml/drift') return { ok: true, drift: { status: 'not_enough_data', psi: {}, features: [], lastComputedAt: null } };
  if (path === '/api/ml/model-card') return { ok: true, modelCard: null, champion: null, status: 'no_model' };
  if (path === '/api/ml/metrics') return { ok: true, metrics: {}, status: 'empty' };
  if (path === '/api/ml/worker/status') return { ok: true, status: 'available', worker: { available: false, mode: 'e2e_mock' } };
  if (path === '/api/ml/health') return { ok: true, status: 'available', worker: { available: false, mode: 'e2e_mock' } };
  if (method === 'POST' && path === '/api/ml/train') return { ok: false, status: 'training_unavailable', message: 'E2E mock accepted the request but does not train models.' };
  if (method === 'POST' && /^\/api\/ml\/infer\/[^/]+$/.test(path)) return { ok: false, status: 'no_champion_model', message: 'No champion model available. Train and promote a model first.' };
  if (method === 'POST' && /^\/api\/ml\/promote\/[^/]+$/.test(path)) return { ok: false, status: 'model_required', message: 'Select a trained model before promotion.' };
  return null;
}

function mockedApiBody(path: string, method: string) {
  if (BAD_URL_TOKENS.test(path)) return { body: { ok: false, error: { code: 'BAD_E2E_REQUEST', message: 'Invalid generated API path' } }, status: 400, known: true };
  if (path === '/api/auth/me') return { body: { ok: true, user: { id: 'e2e-user', email: 'e2e@example.com', name: 'E2E User' } }, known: true };
  if (method === 'GET' && /^\/api\/chart\/payload\/[^/]+$/.test(path)) return { body: chartPayload(path), known: true };
  if (method === 'GET' && /^\/api\/chart\/cvd\/[^/]+$/.test(path)) return { body: cvd(path), known: true };
  if (method === 'GET' && /^\/api\/volume-profile\/[^/]+$/.test(path)) return { body: volumeProfile(path), known: true };
  if (method === 'GET' && /^\/api\/feeds\/tick\/[^/]+$/.test(path)) return { body: tick(path), known: true };
  if (method === 'GET' && /^\/api\/feeds\/candle\/[^/]+$/.test(path)) return { body: candle(path), known: true };
  if (method === 'GET' && /^\/api\/feeds\/orderbook\/[^/]+$/.test(path)) return { body: orderbook(path), known: true };
  if (method === 'GET' && (path === '/api/feed/status' || path === '/api/feeds/status' || /^\/api\/feeds\/status\/[^/]+$/.test(path))) return { body: { ok: true, status: 'rest_fallback', feeds: [], sources: [], active: false }, known: true };
  if (method === 'GET' && path === '/api/providers/health') return { body: providersHealth, known: true };
  if (method === 'GET' && path === '/api/providers/credentials') return { body: credentials, known: true };
  if (method === 'GET' && path === '/api/providers/active') return { body: { ok: true, activeProviders: [], providerOrder: [], symbols: [] }, known: true };
  if (method === 'GET' && path === '/api/historical/providers') return { body: { ok: true, providers: [], status: 'empty' }, known: true };
  if (method === 'GET' && path === '/api/historical/datasets') return { body: { ok: true, datasets: [historicalDataset], files: [], status: 'ready' }, known: true };
  if (method === 'GET' && /^\/api\/historical\/datasets\/[^/]+(?:\/diagnostics)?$/.test(path)) return { body: { ok: true, dataset: historicalDataset, diagnostics: { status: 'ready', issues: [] } }, known: true };
  if (method === 'DELETE' && /^\/api\/historical\/datasets\/[^/]+$/.test(path)) return { body: { ok: true, status: 'deleted' }, known: true };
  if (method === 'POST' && /^\/api\/historical\/use-for-(ml|backtest|correlation)$/.test(path)) return { body: { ok: true, dataset: historicalDataset, datasetId: historicalDataset.datasetId, status: 'selected' }, known: true };
  if (path.startsWith('/api/ml/')) { const body = mlBody(path, method); if (body) return { body, known: true }; }
  if (method === 'POST' && path === '/api/backtest/run') return { body: { ok: true, status: 'accepted', result: null, rows: [], message: 'E2E mock accepted backtest request without simulating profitability.' }, known: true };
  if (method === 'GET' && path === '/api/backtest/runs') return { body: { ok: true, runs: [], rows: [], status: 'empty' }, known: true };
  if (method === 'GET' && (path === '/api/macro/beta' || path === '/api/multi-asset/beta')) return { body: { ok: true, beta: null, r2: null, status: 'not_enough_data' }, known: true };
  if (method === 'GET' && (path === '/api/macro/correlation' || path === '/api/multi-asset/correlation')) return { body: { ok: true, matrix: [], correlations: [], status: 'not_enough_data' }, known: true };
  if (method === 'GET' && (path === '/api/macro/sector-rotation' || path === '/api/multi-asset/sector-rotation')) return { body: { ok: true, sectors: [], rotation: [], status: 'not_enough_data' }, known: true };
  if (method === 'GET' && (path === '/api/macro/volatility-heatmap' || path === '/api/multi-asset/volatility')) return { body: { ok: true, heatmap: [], volatility: [], status: 'not_enough_data' }, known: true };
  if (method === 'GET' && path === '/api/portfolio/summary') return { body: { ok: true, summary: { equity: 0, cash: 0, realizedPnl: 0, unrealizedPnl: 0 }, status: 'empty' }, known: true };
  if (method === 'GET' && path === '/api/portfolio/positions') return { body: { ok: true, positions: [], status: 'empty' }, known: true };
  if (method === 'GET' && path === '/api/portfolio/pnl') return { body: { ok: true, pnl: { realized: 0, unrealized: 0, total: 0 }, status: 'empty' }, known: true };
  if (method === 'GET' && path === '/api/portfolio/exposure') return { body: { ok: true, exposure: { gross: 0, net: 0, bySymbol: [] }, status: 'empty' }, known: true };
  if (method === 'GET' && path === '/api/portfolio/drawdown') return { body: { ok: true, drawdown: { current: 0, max: 0 }, status: 'empty' }, known: true };
  if (method === 'GET' && path === '/api/portfolio/history') return { body: { ok: true, history: [], status: 'empty' }, known: true };
  if (method === 'GET' && path === '/api/portfolio/var') return { body: { ok: true, var: { value: 0, confidence: 0.95 }, status: 'empty' }, known: true };
  if (method === 'POST' && path === '/api/portfolio/stress-test') return { body: { ok: true, results: [], status: 'empty' }, known: true };
  if (method === 'GET' && path === '/api/risk/summary') return { body: { ok: true, risk: { status: 'empty', score: 0 }, status: 'empty' }, known: true };
  if (method === 'GET' && path === '/api/risk/limits') return { body: { ok: true, limits: [], status: 'empty' }, known: true };
  if (method === 'GET' && path === '/api/risk/var') return { body: { ok: true, var: { value: 0, confidence: 0.95 }, status: 'empty' }, known: true };
  if (method === 'GET' && path === '/api/risk/drawdown') return { body: { ok: true, drawdown: { current: 0, max: 0 }, status: 'empty' }, known: true };
  if (method === 'GET' && path === '/api/risk/exposure') return { body: { ok: true, exposure: { gross: 0, net: 0 }, status: 'empty' }, known: true };
  if (method === 'GET' && path === '/api/risk/alerts') return { body: { ok: true, alerts: [], status: 'empty' }, known: true };

  // Additional implemented workspaces crawled by e2e; safe empty states, not success simulation.
  if (method === 'GET' && /^\/api\/(execution|oms|ops|institutional|rules|strategy-lab|paper|market)\b/.test(path)) return { body: { ok: true, status: 'empty', rows: [], items: [], data: [], orders: [], events: [], stats: {}, audit: [] }, known: true };
  if (method !== 'GET' && /^\/api\/(execution|oms|ops|institutional|rules|strategy-lab|paper|market|feeds|providers)\b/.test(path)) return { body: { ok: true, status: 'accepted', rows: [], items: [] }, known: true };
  if (method === 'GET' && /^\/api\/chart\/(candles|indicators|overlays|orderflow|footprint)\/[^/]+$/.test(path)) return { body: { ok: true, status: 'rest_fallback', candles, data: [], rows: [], indicators: {}, overlays: {}, orderflow: {} }, known: true };
  return { body: { ok: false, error: { code: 'UNMOCKED_E2E_API_ROUTE', message: `No deterministic e2e API mock for ${method} ${path}` } }, status: 501, known: false };
}

export function isKnownE2eMockedApiRequest(method: string, requestUrl: string) {
  try {
    const url = new URL(requestUrl);
    return mockedApiBody(url.pathname, method.toUpperCase()).known;
  } catch {
    return false;
  }
}

export function isE2eMockedResponse(headers: Record<string, string | undefined>) {
  return headers[E2E_MOCK_HEADER] === 'true';
}

export async function installApiMocks(page: Page) {
  await page.route('**/auth/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const invalid = BAD_URL_TOKENS.test(url.pathname);
    if (invalid) return route.fulfill(json({ ok: false, error: { code: 'BAD_E2E_AUTH_REQUEST', message: 'Invalid generated auth path' } }, 400));
    if (url.pathname === '/auth/me' || url.pathname === '/auth/check') return route.fulfill(json({ ok: true, user: { id: 'e2e-user', email: 'e2e@example.com', name: 'E2E User' } }));
    if (url.pathname === '/auth/login' || url.pathname === '/auth/register') return route.fulfill(json({ ok: true, token: 'e2e-token', user: { id: 'e2e-user', email: 'e2e@example.com', name: 'E2E User' } }));
    return route.fulfill(json({ ok: true }));
  });

  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const mock = mockedApiBody(url.pathname, request.method().toUpperCase());
    return route.fulfill(json(mock.body, mock.status ?? 200));
  });
}
