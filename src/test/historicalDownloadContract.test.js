import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createRequire } from 'module';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const require = createRequire(import.meta.url);

let server;
let baseUrl;
let tmpCwd;
let originalCwd;
let yahooProvider;
let normalizeHistoricalSymbols;

async function postDownload(body) {
  const response = await fetch(`${baseUrl}/api/historical/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

const validPayload = (overrides = {}) => ({
  provider: 'yahoo',
  symbols: ['NFLX'],
  timeframe: '1d',
  startDate: '2025-06-06',
  endDate: '2026-06-06',
  session: 'RTH',
  purpose: 'general',
  outputFormat: ['csv'],
  forceRefresh: true,
  ...overrides,
});

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpCwd = mkdtempSync(join(tmpdir(), 'historical-download-contract-'));
  process.chdir(tmpCwd);

  yahooProvider = require('../../server-deliverables/historical/providers/yahooHistoricalProvider.js');
  ({ normalizeHistoricalSymbols } = require('../../server-deliverables/historical/historicalDataService.js'));
  const historicalRoutes = require('../../server-deliverables/api/historicalRoutes.js');

  const app = express();
  app.use(express.json());
  app.use('/api/historical', historicalRoutes);

  server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
  if (originalCwd) process.chdir(originalCwd);
  if (tmpCwd) rmSync(tmpCwd, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  yahooProvider.fetchHistoricalCandles = vi.fn(async ({ symbol, timeframe, startDate, endDate, session }) => ({
    ok: true,
    candles: [{
      timestamp: `${startDate}T14:30:00.000Z`,
      symbol,
      timeframe,
      provider: 'yahoo',
      session,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 1000,
    }, {
      timestamp: `${endDate}T14:30:00.000Z`,
      symbol,
      timeframe,
      provider: 'yahoo',
      session,
      open: 101,
      high: 102,
      low: 100,
      close: 101.5,
      volume: 1200,
    }],
  }));
});

describe('POST /api/historical/download symbol contract', () => {
  it('accepts canonical symbols array without returning symbol_required', async () => {
    const { response, body } = await postDownload(validPayload({ symbols: ['NFLX'] }));

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).not.toBe('symbol_required');
    expect(body.symbols).toEqual(['NFLX']);
  });

  it('accepts legacy symbol string and normalizes it to symbols array', async () => {
    const { response, body } = await postDownload(validPayload({ symbols: undefined, symbol: ' nflx ' }));

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.symbols).toEqual(['NFLX']);
    expect(yahooProvider.fetchHistoricalCandles).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'NFLX' }));
  });

  it('normalizes symbols string safely', async () => {
    const { response, body } = await postDownload(validPayload({ symbols: ' nflx ' }));

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.symbols).toEqual(['NFLX']);
  });

  it('returns structured symbol_required JSON when normalized symbols are empty', async () => {
    const { response, body } = await postDownload(validPayload({ symbols: [' ', ''] }));

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toMatch(/application\/json/);
    expect(body).toEqual({
      ok: false,
      status: 'symbol_required',
      message: 'At least one symbol is required.',
      expected: { symbols: ['SPY', 'QQQ'] },
    });
  });

  it('trims and uppercases symbols during normalization', () => {
    expect(normalizeHistoricalSymbols({ symbols: [' nflx ', ' qqq ', ''] })).toEqual(['NFLX', 'QQQ']);
  });
});
