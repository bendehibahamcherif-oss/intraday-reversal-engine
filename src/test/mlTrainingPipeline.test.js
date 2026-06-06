import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const mlRoutes = require('../../server-deliverables/ai/mlRoutes.js');
const registry = require('../../server-deliverables/ai/modelRegistry.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/ml', mlRoutes);
  return app;
}

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function syntheticCsv(file, rows = 140) {
  const lines = ['timestamp,symbol,open,high,low,close,volume'];
  let price = 100;
  const start = Date.parse('2026-01-02T14:30:00.000Z');
  for (let i = 0; i < rows; i += 1) {
    const drift = Math.sin(i / 8) * 0.22 + Math.cos(i / 15) * 0.1;
    const open = price;
    const close = Math.max(1, open + drift + (i % 9 === 0 ? 0.15 : -0.03));
    const high = Math.max(open, close) + 0.1;
    const low = Math.min(open, close) - 0.1;
    const volume = 1000000 + i * 1000;
    lines.push([new Date(start + i * 60000).toISOString(), 'SPY', open, high, low, close, volume].join(','));
    price = close;
  }
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

describe('ML training endpoint and registry', () => {
  let server;
  let baseUrl;
  let tmpDir;

  beforeEach(async () => {
    registry._reset();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-train-'));
    server = await listen(makeApp());
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    registry._reset();
  });

  it('POST /api/ml/train with no dataset returns dataset_missing JSON', async () => {
    const response = await fetch(`${baseUrl}/api/ml/train`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'SPY', timeframe: '1m', horizon: 20 }),
    });
    const body = await response.json();
    // dataset_missing is ok:false so mlRoutes returns 422 (other ok:false → 422 per spec)
    expect([200, 422]).toContain(response.status);
    expect(body).toMatchObject({ ok: false, status: 'dataset_missing' });
    expect(body.expectedPaths).toContain('datasets/features_snapshot.csv');
  });

  it('POST /api/ml/train with small synthetic CSV trains and registry records run', async () => {
    const datasetPath = path.join(tmpDir, 'features_snapshot.csv');
    syntheticCsv(datasetPath, 180);
    const response = await fetch(`${baseUrl}/api/ml/train`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'SPY', timeframe: '1m', horizon: 10, datasetPath }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('trained');
    expect(body.modelId).toBeTruthy();

    const runsResponse = await fetch(`${baseUrl}/api/ml/model-runs`);
    const runsBody = await runsResponse.json();
    expect(runsBody.runs.some((run) => run.modelId === body.modelId)).toBe(true);
  });

  it('GET /api/ml/model returns champion null before promotion and promote endpoint sets champion', async () => {
    const datasetPath = path.join(tmpDir, 'features_snapshot.csv');
    syntheticCsv(datasetPath, 180);
    const trained = await fetch(`${baseUrl}/api/ml/train`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'SPY', timeframe: '1m', horizon: 10, datasetPath }),
    }).then((res) => res.json());

    const before = await fetch(`${baseUrl}/api/ml/model`).then((res) => res.json());
    expect(before).toMatchObject({ ok: true, champion: null, status: 'no_model' });

    const promoted = await fetch(`${baseUrl}/api/ml/promote/${encodeURIComponent(trained.modelId)}`, { method: 'POST' }).then((res) => res.json());
    expect(promoted).toMatchObject({ ok: true, status: 'promoted' });

    const after = await fetch(`${baseUrl}/api/ml/model`).then((res) => res.json());
    expect(after.ok).toBe(true);
    expect(after.champion.modelId).toBe(trained.modelId);
  });

  it('all train errors are JSON', async () => {
    const response = await fetch(`${baseUrl}/api/ml/train`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: '@@@' }),
    });
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, status: 'invalid_request' });
  });
});
