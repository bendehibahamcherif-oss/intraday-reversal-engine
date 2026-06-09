import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createRequire } from 'module';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const require = createRequire(import.meta.url);
let server;
let baseUrl;
let tmpCwd;
let originalCwd;
let registry;
let yahooProvider;
let trainingService;

const csv = `timestamp,symbol,timeframe,open,high,low,close,volume,provider,session\n2024-01-01T00:00:00.000Z,NFLX,1d,100,101,99,100,1000,yahoo,RTH\n2024-01-02T00:00:00.000Z,NFLX,1d,101,102,100,102,1000,yahoo,RTH\n2024-01-01T00:00:00.000Z,SPY,1d,100,101,99,100,1000,yahoo,RTH\n2024-01-02T00:00:00.000Z,SPY,1d,101,102,100,101,1000,yahoo,RTH\n`;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  return { response, body: await response.json() };
}

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpCwd = mkdtempSync(join(tmpdir(), 'hist-contract-e2e-'));
  process.chdir(tmpCwd);

  registry = require('../../server-deliverables/historical/historicalDatasetRegistry.js');
  yahooProvider = require('../../server-deliverables/historical/providers/yahooHistoricalProvider.js');
  trainingService = require('../../server-deliverables/ai/trainingService.js');
  const historicalRoutes = require('../../server-deliverables/api/historicalRoutes.js');
  const mlRoutes = require('../../server-deliverables/ai/mlRoutes.js');
  const backtestRoutes = require('../../server-deliverables/api/backtestRoutes.js');
  const multiAssetRoutes = require('../../server-deliverables/api/multiAssetRoutes.js');

  const app = express();
  app.use(express.json());
  app.use('/api/historical', historicalRoutes);
  app.use('/api/ml', mlRoutes);
  app.use('/api/backtest', backtestRoutes);
  app.use('/api/multi-asset', multiAssetRoutes);
  app.use('/api/macro', multiAssetRoutes);
  server = await new Promise((resolve) => { const srv = app.listen(0, () => resolve(srv)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (server) await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  if (originalCwd) process.chdir(originalCwd);
  if (tmpCwd) rmSync(tmpCwd, { recursive: true, force: true });
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  registry._save([]);
  yahooProvider.fetchHistoricalCandles = vi.fn(async ({ symbol, timeframe, startDate, session }) => ({
    ok: true,
    candles: [0, 1, 2].map((i) => ({
      timestamp: `2024-01-0${i + 1}T00:00:00.000Z`, symbol, timeframe, provider: 'yahoo', session,
      open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1000,
    })),
  }));
});

function saveDataset(id = 'hist_NFLX_SPY_1d_RTH_20240101_20240103_yahoo', fileExists = true) {
  const file = join(tmpCwd, 'data', 'historical', 'general', `${id}.csv`);
  mkdirSync(join(tmpCwd, 'data', 'historical', 'general'), { recursive: true });
  if (fileExists) writeFileSync(file, csv, 'utf8');
  return registry.saveDataset({ datasetId: id, id, provider: 'yahoo', symbols: ['NFLX', 'SPY'], timeframe: '1d', startDate: '2024-01-01', endDate: '2024-01-03', session: 'RTH', purpose: 'general', rowCount: fileExists ? 4 : 10, rowsBySymbol: { NFLX: 2, SPY: 2 }, files: { csv: file }, status: 'ready' });
}

describe('historical canonical dataset contract', () => {
  it('download accepts symbols array and returns dataset.datasetId without undefined fields', async () => {
    const { response, body } = await request('/api/historical/download', { method: 'POST', body: JSON.stringify({ provider: 'yahoo', symbols: [' nflx ', 'NFLX'], timeframe: '1d', startDate: '2024-01-01', endDate: '2024-01-03', session: 'RTH', purpose: 'general', outputFormat: ['csv'], forceRefresh: true }) });
    expect(response.status).toBe(200);
    expect(body.status).not.toBe('symbol_required');
    expect(body.dataset.datasetId).toBe(body.datasetId);
    expect(body.dataset.id).toBe(body.datasetId);
    expect(body.dataset.symbols).toEqual(['NFLX']);
    expect(JSON.stringify(body)).not.toContain('undefined');
  });

  it('download accepts legacy symbol and empty symbols returns symbol_required JSON', async () => {
    expect((await request('/api/historical/download', { method: 'POST', body: JSON.stringify({ provider: 'yahoo', symbol: ' nflx ', timeframe: '1d', startDate: '2024-01-01', endDate: '2024-01-03' }) })).body.symbols).toEqual(['NFLX']);
    const { response, body } = await request('/api/historical/download', { method: 'POST', body: JSON.stringify({ provider: 'yahoo', symbols: [], timeframe: '1d', startDate: '2024-01-01', endDate: '2024-01-03' }) });
    expect(response.status).toBe(400);
    expect(body).toEqual({ ok: false, status: 'symbol_required', message: 'At least one symbol is required.', expected: { symbols: ['SPY', 'QQQ'] } });
  });

  it('list/get normalize old registry records with only id', async () => {
    registry._save([{ id: 'legacy_id', rowCount: undefined }]);
    expect((await request('/api/historical/datasets')).body.datasets[0]).toMatchObject({ datasetId: 'legacy_id', id: 'legacy_id', rowCount: 0, symbols: [] });
    expect((await request('/api/historical/datasets/legacy_id')).body.dataset.datasetId).toBe('legacy_id');
  });
});

describe('ML/backtest/correlation dataset consumers', () => {
  it('ML train with valid datasetId resolves registry file path and includes datasetId', async () => {
    const ds = saveDataset();
    const spy = vi.spyOn(trainingService, 'trainModel').mockResolvedValue({ ok: true, status: 'trained', datasetId: ds.datasetId, modelId: 'm1' });
    const { body } = await request('/api/ml/train', { method: 'POST', body: JSON.stringify({ symbol: 'SPY', timeframe: '1d', horizon: 10, datasetId: ds.datasetId }) });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ datasetId: ds.datasetId }));
    expect(body.datasetId).toBe(ds.datasetId);
  });

  it('ML train returns dataset_not_found and dataset_file_missing specifically', async () => {
    expect((await request('/api/ml/train', { method: 'POST', body: JSON.stringify({ datasetId: 'missing', symbol: 'SPY', timeframe: '1d' }) })).body.status).toBe('dataset_not_found');
    const ds = saveDataset('missing_file', false);
    expect((await request('/api/ml/train', { method: 'POST', body: JSON.stringify({ datasetId: ds.datasetId, symbol: 'SPY', timeframe: '1d' }) })).body.status).toBe('dataset_file_missing');
  });

  it('backtest resolves dataset, includes dataSource.datasetId, and reports missing files', async () => {
    const ds = saveDataset();
    const ok = await request('/api/backtest/run', { method: 'POST', body: JSON.stringify({ datasetId: ds.datasetId, symbol: 'NFLX', timeframe: '1d', strategy: { type: 'default_or_existing' } }) });
    expect(ok.body.dataSource.datasetId).toBe(ds.datasetId);
    expect((await request('/api/backtest/run', { method: 'POST', body: JSON.stringify({ datasetId: 'missing', symbol: 'NFLX' }) })).body.status).toBe('dataset_not_found');
    const missing = saveDataset('bt_missing_file', false);
    expect((await request('/api/backtest/run', { method: 'POST', body: JSON.stringify({ datasetId: missing.datasetId, symbol: 'NFLX' }) })).body.status).toBe('dataset_file_missing');
  });

  it('correlation and beta with datasetId never return NaN and not-enough-data is structured', async () => {
    const ds = saveDataset();
    const corr = (await request(`/api/multi-asset/correlation?datasetId=${ds.datasetId}&symbols=NFLX,SPY&window=20`)).body;
    expect(JSON.stringify(corr)).not.toMatch(/NaN|Infinity/);
    expect(corr.datasetId).toBe(ds.datasetId);
    const beta = (await request(`/api/multi-asset/beta?datasetId=${ds.datasetId}&symbol=NFLX&benchmark=SPY&window=20`)).body;
    expect(JSON.stringify(beta)).not.toMatch(/NaN|Infinity/);
    // Tiny dataset: both symbols present, but only 1 row each — insufficient for window=20
    const tiny = saveDataset('tiny_dataset');
    writeFileSync(
      tiny.files.csv,
      'timestamp,symbol,timeframe,open,high,low,close,volume,provider,session,sourceType,adjusted\n' +
      '2024-01-01T00:00:00.000Z,NFLX,1d,1,1,1,1,1,yahoo,RTH,historical,false\n' +
      '2024-01-01T00:00:00.000Z,SPY,1d,1,1,1,1,1,yahoo,RTH,historical,false\n',
      'utf8',
    );
    const notEnough = (await request(`/api/multi-asset/correlation?datasetId=${tiny.datasetId}&symbols=NFLX,SPY&window=20`)).body;
    expect(notEnough).toMatchObject({ status: 'not_enough_data', observations: 0, matrix: [] });
    const betaTiny = (await request(`/api/multi-asset/beta?datasetId=${tiny.datasetId}&symbol=NFLX&benchmark=SPY&window=20`)).body;
    expect(betaTiny).toMatchObject({ status: 'not_enough_data', beta: null, r2: null });
  });
});
