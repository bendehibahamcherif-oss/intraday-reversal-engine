import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mlRoutes = require('../../server-deliverables/ai/mlRoutes.js');
const portfolioRoutes = require('../../server-deliverables/api/portfolioRoutes.js');
const riskRoutes = require('../../server-deliverables/api/riskRoutes.js');
const { createProviderRouter, ProviderStateService } = require('../../server/providerStateService.cjs');

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/ml', mlRoutes);
  app.use('/api/portfolio', portfolioRoutes);
  app.use('/api/risk', riskRoutes);
  app.use('/api', createProviderRouter(new ProviderStateService({ filePath: `/tmp/provider-contract-${Date.now()}.json` })));
  server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

async function json(path) {
  const res = await fetch(`${baseUrl}${path}`);
  return { res, body: await res.json() };
}

describe('platform required endpoint contracts', () => {
  it('ML health returns an available empty worker contract', async () => {
    const { res, body } = await json('/api/ml/health');
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, status: 'available' });
    expect(body.worker).toHaveProperty('available');
    expect(body.worker).toHaveProperty('mode');
  });

  it('portfolio safe empty state endpoints do not 404', async () => {
    for (const [path, key] of [
      ['/api/portfolio/summary', 'summary'],
      ['/api/portfolio/positions', 'positions'],
      ['/api/portfolio/pnl', 'pnl'],
      ['/api/portfolio/exposure', 'exposure'],
      ['/api/portfolio/drawdown', 'drawdown'],
      ['/api/portfolio/history', 'history'],
    ]) {
      const { res, body } = await json(path);
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body).toHaveProperty(key);
    }
  });

  it('risk safe empty state endpoints do not 404', async () => {
    for (const [path, key] of [
      ['/api/risk/summary', 'risk'],
      ['/api/risk/limits', 'limits'],
      ['/api/risk/var', 'var'],
      ['/api/risk/drawdown', 'drawdown'],
      ['/api/risk/exposure', 'exposure'],
      ['/api/risk/alerts', 'alerts'],
    ]) {
      const { res, body } = await json(path);
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body).toHaveProperty(key);
    }
  });

  it('feed demo generators are mounted but do not create fake data', async () => {
    const response = await fetch(`${baseUrl}/api/feeds/demo/tick/SPY`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: false, tick: null, status: 'demo_generation_disabled' });
  });
});

describe('apiRequest standard response wrapper', () => {
  it('normalizes 204, 404, invalid JSON, and network errors', async () => {
    vi.resetModules();
    const originalFetch = global.fetch;
    const { apiRequest } = await import('../api.js');

    global.fetch = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(apiRequest('/empty')).resolves.toMatchObject({ ok: true, status: 204, data: null, error: null, endpoint: '/empty', method: 'GET' });

    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'missing' } }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    await expect(apiRequest('/missing')).resolves.toMatchObject({ ok: false, status: 404, error: 'missing' });

    global.fetch = vi.fn(async () => new Response('not json', { status: 200 }));
    await expect(apiRequest('/bad-json')).resolves.toMatchObject({ ok: false, status: 0, error: 'API response is not JSON (/bad-json)' });

    global.fetch = vi.fn(async () => { throw new Error('offline'); });
    await expect(apiRequest('/offline')).resolves.toMatchObject({ ok: false, status: 0, error: 'offline' });

    global.fetch = originalFetch;
  });
});
