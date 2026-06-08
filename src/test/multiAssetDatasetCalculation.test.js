/**
 * Multi-Asset dataset calculation tests.
 *
 * These tests start a real Express server with the multiAssetRoutes handler and
 * exercise all four macro endpoints with:
 *   - A two-symbol (SPY + NFLX) fixture dataset
 *   - A single-symbol (SPY only) dataset  → triggers missing_symbols response
 *   - No datasetId                         → live-store path (returns not_enough_data in tests)
 *
 * Validates:
 *  - correlation with valid two-symbol dataset returns finite matrix
 *  - correlation with missing NFLX returns missing_symbols
 *  - beta with valid two-symbol dataset returns finite beta/r2
 *  - beta with missing NFLX returns missing_symbols
 *  - insufficient overlap returns not_enough_data
 *  - volatility heatmap returns finite values from dataset
 *  - sector rotation returns sector_metadata_missing when user symbols are non-ETFs
 *  - no NaN/Infinity in any macro response
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// ── Fixture helpers ────────────────────────────────────────────────────────────

const CANONICAL_HEADER = 'timestamp,symbol,timeframe,open,high,low,close,volume,provider,session,sourceType,adjusted';

function makeCsvRow(timestamp, symbol, close) {
  return `${timestamp},${symbol},1d,${close},${close},${close},${close},1000000,test,RTH,historical,false`;
}

function generatePrices(n, startPrice, dailyReturnPct) {
  const prices = [startPrice];
  for (let i = 1; i < n; i++) {
    prices.push(Number((prices[i - 1] * (1 + dailyReturnPct + (Math.random() - 0.5) * 0.01)).toFixed(4)));
  }
  return prices;
}

function generateDateRange(n, startIso = '2024-01-02') {
  const dates = [];
  let d = new Date(startIso);
  while (dates.length < n) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(d.toISOString().slice(0, 10) + 'T00:00:00.000Z');
    d = new Date(d.getTime() + 86400000);
  }
  return dates;
}

function createTwoSymbolDataset(tmpDir, rowsPerSymbol = 60) {
  const dates = generateDateRange(rowsPerSymbol);
  const spyPrices  = generatePrices(rowsPerSymbol, 450, 0.0003);
  const nflxPrices = generatePrices(rowsPerSymbol, 600, 0.0004);

  const rows = [CANONICAL_HEADER];
  for (let i = 0; i < rowsPerSymbol; i++) {
    rows.push(makeCsvRow(dates[i], 'SPY', spyPrices[i]));
    rows.push(makeCsvRow(dates[i], 'NFLX', nflxPrices[i]));
  }
  const csvPath = path.join(tmpDir, 'two_symbol.csv');
  fs.writeFileSync(csvPath, rows.join('\n'));
  return { csvPath, symbols: ['SPY', 'NFLX'], rowCount: rowsPerSymbol * 2 };
}

function createOneSymbolDataset(tmpDir, rowsPerSymbol = 60) {
  const dates = generateDateRange(rowsPerSymbol);
  const spyPrices = generatePrices(rowsPerSymbol, 450, 0.0003);

  const rows = [CANONICAL_HEADER];
  for (let i = 0; i < rowsPerSymbol; i++) {
    rows.push(makeCsvRow(dates[i], 'SPY', spyPrices[i]));
  }
  const csvPath = path.join(tmpDir, 'one_symbol.csv');
  fs.writeFileSync(csvPath, rows.join('\n'));
  return { csvPath, symbols: ['SPY'], rowCount: rowsPerSymbol };
}

function createTinyDataset(tmpDir) {
  // Only 2 rows per symbol — insufficient for a window=20
  const dates = generateDateRange(3);
  const rows = [CANONICAL_HEADER];
  rows.push(makeCsvRow(dates[0], 'SPY', 450));
  rows.push(makeCsvRow(dates[1], 'SPY', 451));
  rows.push(makeCsvRow(dates[0], 'NFLX', 600));
  rows.push(makeCsvRow(dates[1], 'NFLX', 601));
  const csvPath = path.join(tmpDir, 'tiny.csv');
  fs.writeFileSync(csvPath, rows.join('\n'));
  return { csvPath, symbols: ['SPY', 'NFLX'], rowCount: 4 };
}

// ── Test server setup ──────────────────────────────────────────────────────────

let server;
let baseUrl;
let tmpDir;
let twoDatasetId;
let oneDatasetId;
let tinyDatasetId;

function hasInvalid(value, seen = new WeakSet()) {
  if (typeof value === 'number') return !Number.isFinite(value);
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((v) => hasInvalid(v, seen));
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-test-'));

  // Patch the registry module to use in-memory fake datasets keyed by id
  const registry = require('../../server-deliverables/historical/historicalDatasetRegistry');

  const twoDs  = createTwoSymbolDataset(tmpDir, 60);
  const oneDs  = createOneSymbolDataset(tmpDir, 60);
  const tinyDs = createTinyDataset(tmpDir);

  twoDatasetId  = 'test_two_symbol';
  oneDatasetId  = 'test_one_symbol';
  tinyDatasetId = 'test_tiny';

  // Monkey-patch registry.get to return our fixture datasets
  const origGet = registry.get.bind(registry);
  registry.get = (id) => {
    if (id === twoDatasetId)  return { datasetId: id, symbols: twoDs.symbols,  files: { csv: twoDs.csvPath,  json: null }, rowCount: twoDs.rowCount };
    if (id === oneDatasetId)  return { datasetId: id, symbols: oneDs.symbols,  files: { csv: oneDs.csvPath,  json: null }, rowCount: oneDs.rowCount };
    if (id === tinyDatasetId) return { datasetId: id, symbols: tinyDs.symbols, files: { csv: tinyDs.csvPath, json: null }, rowCount: tinyDs.rowCount };
    return origGet(id);
  };

  const multiAssetRoutes = require('../../server-deliverables/api/multiAssetRoutes');
  const app = express();
  app.use(express.json());
  app.use('/api/multi-asset', multiAssetRoutes);
  app.use('/api/macro',       multiAssetRoutes);

  server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const body = await response.json();
  return { response, body };
}

// ── Correlation tests ──────────────────────────────────────────────────────────

describe('correlation — dataset-backed', () => {
  it('returns finite matrix for valid two-symbol dataset', async () => {
    const { response, body } = await getJson(`/api/macro/correlation?symbols=SPY,NFLX&window=20&datasetId=${twoDatasetId}`);
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('ok');
    expect(body.symbols).toEqual(['SPY', 'NFLX']);
    expect(Array.isArray(body.matrix)).toBe(true);
    expect(body.matrix.length).toBe(2);
    // Diagonal is 1
    expect(body.matrix[0][0]).toBe(1);
    expect(body.matrix[1][1]).toBe(1);
    // Off-diagonal is a finite number
    expect(typeof body.matrix[0][1]).toBe('number');
    expect(Number.isFinite(body.matrix[0][1])).toBe(true);
    expect(body.matrix[0][1]).toBe(body.matrix[1][0]);
    expect(body.observations).toBeGreaterThanOrEqual(20);
    expect(hasInvalid(body)).toBe(false);
  });

  it('returns missing_symbols when NFLX absent from SPY-only dataset', async () => {
    const { response, body } = await getJson(`/api/macro/correlation?symbols=SPY,NFLX&window=20&datasetId=${oneDatasetId}`);
    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.status).toBe('missing_symbols');
    expect(body.missingSymbols).toContain('NFLX');
    expect(body.availableSymbols).toContain('SPY');
    expect(hasInvalid(body)).toBe(false);
  });

  it('returns not_enough_data when observations insufficient for window', async () => {
    const { response, body } = await getJson(`/api/macro/correlation?symbols=SPY,NFLX&window=20&datasetId=${tinyDatasetId}`);
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('not_enough_data');
    expect(body.observations).toBeLessThan(20);
    expect(hasInvalid(body)).toBe(false);
  });

  it('returns 404 for unknown datasetId', async () => {
    const { response, body } = await getJson('/api/macro/correlation?symbols=SPY,NFLX&datasetId=nonexistent_dataset_xyz');
    expect(response.status).toBe(404);
    expect(body.status).toBe('dataset_not_found');
  });
});

// ── Beta tests ─────────────────────────────────────────────────────────────────

describe('beta — dataset-backed', () => {
  it('returns finite beta and r2 for valid two-symbol dataset', async () => {
    const { response, body } = await getJson(`/api/macro/beta?symbol=NFLX&benchmark=SPY&window=20&datasetId=${twoDatasetId}`);
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('ok');
    expect(typeof body.beta).toBe('number');
    expect(Number.isFinite(body.beta)).toBe(true);
    expect(typeof body.r2).toBe('number');
    expect(Number.isFinite(body.r2)).toBe(true);
    expect(body.r2).toBeGreaterThanOrEqual(0);
    expect(body.r2).toBeLessThanOrEqual(1);
    expect(body.observations).toBeGreaterThanOrEqual(20);
    expect(hasInvalid(body)).toBe(false);
  });

  it('returns missing_symbols when NFLX absent from SPY-only dataset', async () => {
    const { response, body } = await getJson(`/api/macro/beta?symbol=NFLX&benchmark=SPY&window=20&datasetId=${oneDatasetId}`);
    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.status).toBe('missing_symbols');
    expect(body.missingSymbols).toContain('NFLX');
    expect(hasInvalid(body)).toBe(false);
  });

  it('returns not_enough_data for tiny dataset', async () => {
    const { response, body } = await getJson(`/api/macro/beta?symbol=NFLX&benchmark=SPY&window=20&datasetId=${tinyDatasetId}`);
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('not_enough_data');
    expect(body.beta).toBeNull();
    expect(body.r2).toBeNull();
    expect(hasInvalid(body)).toBe(false);
  });
});

// ── Volatility tests ───────────────────────────────────────────────────────────

describe('volatility — dataset-backed', () => {
  it('returns finite volatility for valid two-symbol dataset', async () => {
    const { response, body } = await getJson(`/api/macro/volatility-heatmap?symbols=SPY,NFLX&window=20&datasetId=${twoDatasetId}`);
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    const items = body.volatility || body.heatmap || [];
    expect(items.length).toBe(2);
    for (const item of items) {
      expect(item.vol).not.toBeNull();
      expect(Number.isFinite(item.vol)).toBe(true);
      expect(item.vol).toBeGreaterThan(0);
    }
    expect(hasInvalid(body)).toBe(false);
  });

  it('returns missing_symbols when NFLX absent', async () => {
    const { response, body } = await getJson(`/api/macro/volatility-heatmap?symbols=SPY,NFLX&window=20&datasetId=${oneDatasetId}`);
    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.status).toBe('missing_symbols');
    expect(body.missingSymbols).toContain('NFLX');
    expect(hasInvalid(body)).toBe(false);
  });
});

// ── Sector rotation tests ──────────────────────────────────────────────────────

describe('sector rotation', () => {
  it('returns sector_metadata_missing when user symbols are not sector ETFs', async () => {
    const { response, body } = await getJson(`/api/macro/sector-rotation?symbols=SPY,NFLX&window=20`);
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('not_available');
    expect(body.reason).toBe('sector_metadata_missing');
    expect(body.symbols).toContain('SPY');
    expect(body.symbols).toContain('NFLX');
    expect(hasInvalid(body)).toBe(false);
  });

  it('returns sector_metadata_missing when datasetId is provided', async () => {
    const { response, body } = await getJson(`/api/macro/sector-rotation?symbols=SPY,NFLX&window=20&datasetId=${twoDatasetId}`);
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('not_available');
    expect(body.reason).toBe('sector_metadata_missing');
    expect(hasInvalid(body)).toBe(false);
  });

  it('falls through to ETF proxy path when no symbols or datasetId provided', async () => {
    const { response, body } = await getJson('/api/macro/sector-rotation?window=20');
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    // Live store is empty in test — so either not_enough_data or available
    expect(['not_enough_data', 'available']).toContain(body.status);
    expect(hasInvalid(body)).toBe(false);
  });
});

// ── Cross-endpoint NaN/Infinity guard ─────────────────────────────────────────

describe('no NaN/Infinity in any macro response', () => {
  const endpoints = [
    `/api/macro/correlation?symbols=SPY,NFLX&window=20&datasetId=${() => twoDatasetId}`,
    `/api/macro/beta?symbol=NFLX&benchmark=SPY&window=20&datasetId=${() => twoDatasetId}`,
    `/api/macro/volatility-heatmap?symbols=SPY,NFLX&window=20&datasetId=${() => twoDatasetId}`,
    '/api/macro/sector-rotation?symbols=SPY,NFLX&window=20',
  ];

  for (const endpointFn of endpoints) {
    it(`no NaN/Infinity: ${endpointFn}`, async () => {
      const url = typeof endpointFn === 'function'
        ? endpointFn()
        : endpointFn.replace(/\$\{.*?\}/, twoDatasetId);
      const { body } = await getJson(url);
      expect(hasInvalid(body), `NaN/Infinity in response: ${JSON.stringify(body).slice(0, 200)}`).toBe(false);
    });
  }
});
