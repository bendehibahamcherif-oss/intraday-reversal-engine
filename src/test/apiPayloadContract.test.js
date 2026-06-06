import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockJsonFetch(payload = { ok: true }) {
  global.fetch = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
}

describe('critical API payload contract', () => {
  it('backtest run payload includes datasetId and no undefined fields', async () => {
    mockJsonFetch();
    await api.runBacktest('NFLX', 'default_or_existing', '1d', 'hist_NFLX_1d_RTH_yahoo');
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/backtest/run');
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ symbol: 'NFLX', timeframe: '1d', datasetId: 'hist_NFLX_1d_RTH_yahoo' });
    expect(JSON.stringify(body)).not.toContain('undefined');
  });

  it('correlation request includes selected datasetId and rejects explicit undefined datasetId', async () => {
    mockJsonFetch({ ok: true, matrix: [] });
    await api.getMultiAssetCorrelation({ symbols: ['NFLX', 'SPY'], window: 20, datasetId: 'hist_NFLX_1d_RTH_yahoo' });
    expect(global.fetch.mock.calls[0][0]).toContain('datasetId=hist_NFLX_1d_RTH_yahoo');
    await expect(api.getMultiAssetCorrelation({ symbols: ['NFLX'], datasetId: undefined })).rejects.toThrow('datasetId must not be undefined');
  });
});
