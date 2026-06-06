import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getDatasetId, assertDatasetId } from '../utils/datasets.js';
import { stripUndefinedDeep } from '../utils/payload.js';
import { useHistoricalDataStore } from '../store/historicalDataStore.js';
import { useAILabStore } from '../store/aiLabStore.js';
import { useQuantLabStore } from '../store/quantLabStore.js';
import { useMacroStore } from '../store/macroStore.js';
import HistoricalDataWorkspace from '../workspaces/HistoricalDataWorkspace.jsx';

const apiMock = vi.hoisted(() => ({
  api: {
    getHistoricalProviders: vi.fn(),
    getHistoricalDatasets: vi.fn(),
    getHistoricalDataset: vi.fn(),
    deleteHistoricalDataset: vi.fn(),
    downloadHistoricalData: vi.fn(),
    trainMLModel: vi.fn(),
    runBacktest: vi.fn(),
    getMultiAssetCorrelation: vi.fn(),
  },
}));
vi.mock('../api.js', () => apiMock);

const ds = { datasetId: 'hist_NFLX_1d_RTH_20210607_20260605_yahoo', id: 'hist_NFLX_1d_RTH_20210607_20260605_yahoo', provider: 'yahoo', symbols: ['NFLX'], timeframe: '1d', startDate: '2021-06-07', endDate: '2026-06-05', session: 'RTH', purpose: 'general', rowCount: 1234, rowsBySymbol: { NFLX: 1234 }, files: { csv: 'server/data/historical/general/file.csv' }, status: 'ready', warnings: [] };

beforeEach(() => {
  vi.clearAllMocks();
  useHistoricalDataStore.setState({ datasets: [], selectedDatasetId: null, selectedDataset: null, datasetsError: '', selectedMlDatasetId: null, selectedBacktestDatasetId: null, selectedCorrelationDatasetId: null });
  useAILabStore.setState({ selectedMlDatasetId: null, selectedMlDataset: null, trainError: '', trainingJob: null });
  useQuantLabStore.setState({ backtestPendingDatasetId: null, selectedBacktestDatasetId: null, selectedBacktestDataset: null });
  useMacroStore.setState({ correlationDatasetId: null, selectedCorrelationDatasetId: null, selectedCorrelationDataset: null, correlation: null });
});

describe('dataset frontend helpers and actions', () => {
  it('getDatasetId prefers datasetId, falls back to id, and returns null', () => {
    expect(getDatasetId({ datasetId: 'A', id: 'B' })).toBe('A');
    expect(getDatasetId({ id: 'B' })).toBe('B');
    expect(getDatasetId({})).toBeNull();
    expect(assertDatasetId({})).toEqual({ ok: false, error: 'Dataset ID missing. Reload dataset registry.' });
  });

  it('use actions save real ids, produce no undefined success messages, and block missing ids', () => {
    const store = useHistoricalDataStore.getState();
    expect(store.useDatasetForMl(ds).message).not.toContain('undefined');
    expect(useHistoricalDataStore.getState().selectedMlDatasetId).toBe(ds.datasetId);
    expect(store.useDatasetForBacktest(ds).datasetId).toBe(ds.datasetId);
    expect(store.useDatasetForCorrelation(ds).datasetId).toBe(ds.datasetId);
    expect(store.useDatasetForMl({}).ok).toBe(false);
    expect(store.useDatasetForBacktest({}).ok).toBe(false);
    expect(store.useDatasetForCorrelation({}).ok).toBe(false);
  });

  it('payload helpers remove undefined and ML/backtest/correlation stores include selected datasetId', async () => {
    expect(stripUndefinedDeep({ datasetId: undefined, nested: { symbol: undefined, ok: true } })).toEqual({ nested: { ok: true } });
    useAILabStore.getState().setSelectedDataset(ds.datasetId, ds);
    apiMock.api.trainMLModel.mockResolvedValue({ ok: true, status: 'trained', datasetId: ds.datasetId });
    await useAILabStore.getState().trainModel();
    expect(apiMock.api.trainMLModel).toHaveBeenCalledWith('SPY', expect.objectContaining({ datasetId: ds.datasetId }));

    useQuantLabStore.getState().setBacktestPendingDatasetId(ds.datasetId, ds);
    expect(useQuantLabStore.getState().backtestPendingDatasetId).toBe(ds.datasetId);
    useMacroStore.getState().setCorrelationDatasetId(ds.datasetId, ds);
    apiMock.api.getMultiAssetCorrelation.mockResolvedValue({ ok: true, datasetId: ds.datasetId, matrix: [] });
    await useMacroStore.getState().loadCorrelation();
    expect(apiMock.api.getMultiAssetCorrelation).toHaveBeenCalledWith(expect.objectContaining({ datasetId: ds.datasetId }));
  });


  it('dataset detail renders canonical fields', async () => {
    apiMock.api.getHistoricalProviders.mockResolvedValue({ ok: true, providers: [{ id: 'yahoo' }] });
    apiMock.api.getHistoricalDatasets.mockResolvedValue({ ok: true, datasets: [ds] });
    apiMock.api.getHistoricalDataset.mockResolvedValue({ ok: true, dataset: ds });
    render(<HistoricalDataWorkspace />);
    expect(await screen.findByText(ds.datasetId)).toBeInTheDocument();
    screen.getByText(ds.datasetId).click();
    expect(await screen.findByText('Dataset ID')).toBeInTheDocument();
    expect(screen.getAllByText(ds.datasetId).length).toBeGreaterThan(0);
    expect(screen.getByText('NFLX')).toBeInTheDocument();
    expect(screen.getByText('1d')).toBeInTheDocument();
    expect(screen.getByText('2021-06-07 → 2026-06-05')).toBeInTheDocument();
    expect(screen.getAllByText('yahoo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1234').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ready').length).toBeGreaterThan(0);
  });
});
