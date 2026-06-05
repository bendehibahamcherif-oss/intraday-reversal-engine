import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mlRoutes = require('../../server-deliverables/ai/mlRoutes.js');

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/ml', mlRoutes);
  server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return { response, body: await response.json() };
}

describe('ML backend empty-state route contracts', () => {
  it('GET /api/ml/drift returns structured not_enough_data empty state', async () => {
    const { response, body } = await getJson('/api/ml/drift');
    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      drift: { status: 'not_enough_data', psi: {}, features: [], lastComputedAt: null },
    });
  });

  it('GET /api/ml/model-runs returns runs []', async () => {
    const { response, body } = await getJson('/api/ml/model-runs');
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.runs).toEqual([]);
  });

  it('GET /api/ml/model returns no_model without 404 when no champion exists', async () => {
    const { response, body } = await getJson('/api/ml/model');
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, champion: null, challengers: [], status: 'no_model' });
  });

  it('POST /api/ml/infer/:symbol returns no_champion_model as valid contract response', async () => {
    const response = await fetch(`${baseUrl}/api/ml/infer/SPY`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeframe: '1m', featureVector: [1, 2, 3] }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: false,
      status: 'no_champion_model',
      message: 'No champion model available. Train and promote a model first.',
    });
  });
});
