import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MacroWorkspace from '../workspaces/MacroWorkspace.jsx';
import { resolveCompatibleDatasetsFromRegistry } from '../services/dataRequirementResolver.js';
import { useHistoricalDataStore } from '../store/historicalDataStore.js';
import { MACRO_SELECTED_DATASET_STORAGE_KEY, useMacroStore } from '../store/macroStore.js';

const apiMock = vi.hoisted(() => ({
  api: {
    getMultiAssetCorrelation: vi.fn(),
    getMultiAssetBeta: vi.fn(),
    getMultiAssetSectorRotation: vi.fn(),
    getMultiAssetVolatility: vi.fn(),
  },
}));
vi.mock('../api.js', () => apiMock);

const spyDataset = { datasetId: 'hist_SPY_1d_RTH_20250611_20260611_yahoo', symbols: ['SPY'], timeframe: '1d', provider: 'yahoo', session: 'RTH', startDate: '2025-06-11', endDate: '2026-06-11', rowCount: 250, rowsBySymbol: { SPY: 250 }, status: 'ready', files: { csv: '/tmp/spy.csv' } };
const nflxDataset = { datasetId: 'hist_NFLX_1d_RTH_20250611_20260611_yahoo', symbols: ['NFLX'], timeframe: '1d', provider: 'yahoo', session: 'RTH', startDate: '2025-06-11', endDate: '2026-06-11', rowCount: 250, rowsBySymbol: { NFLX: 250 }, status: 'ready', files: { csv: '/tmp/nflx.csv' } };

function resetStores() {
  localStorage.clear();
  vi.clearAllMocks();
  apiMock.api.getMultiAssetCorrelation.mockResolvedValue({ ok: true, status: 'ready', resolution: 'multi_dataset', symbols: ['SPY', 'NFLX'], matrix: [[1, 0.5], [0.5, 1]], alignedRows: 250, observations: 249 });
  apiMock.api.getMultiAssetBeta.mockResolvedValue({ ok: true, status: 'ready', resolution: 'multi_dataset', asset: 'NFLX', benchmark: 'SPY', beta: 1.1, r2: 0.4, observations: 249 });
  apiMock.api.getMultiAssetSectorRotation.mockResolvedValue({ ok: true, status: 'not_available', sectors: [] });
  apiMock.api.getMultiAssetVolatility.mockResolvedValue({ ok: true, status: 'ready', heatmap: [] });
  useHistoricalDataStore.setState({ datasets: [spyDataset, nflxDataset], selectedCorrelationDatasetId: nflxDataset.datasetId, selectedCorrelationDataset: nflxDataset });
  useMacroStore.setState({
    symbols: ['SPY', 'NFLX'], symbolsInput: 'SPY, NFLX', benchmark: 'SPY', selectedAsset: 'NFLX', window: 20, timeframe: '1d',
    correlation: null, beta: null, correlationDatasetId: nflxDataset.datasetId, selectedCorrelationDatasetId: nflxDataset.datasetId,
    selectedCorrelationDataset: nflxDataset, correlationError: '', betaError: '', lastResolution: null, lastRequest: null, clearedStaleDatasetId: false,
  });
}

beforeEach(resetStores);

describe('macro final SPY/NFLX regressions', () => {
  it('keeps the current symbol input authoritative and never displays six stale assets', async () => {
    localStorage.setItem('reversal-macro', JSON.stringify({ state: { symbols: ['SPY', 'NFLX', 'AAPL', 'MSFT', 'QQQ', 'TSLA'], symbolsInput: 'SPY,NFLX,AAPL,MSFT,QQQ,TSLA' } }));
    render(<MacroWorkspace />);
    const input = screen.getByPlaceholderText('SPY, QQQ, IWM, DIA, TLT, GLD');
    fireEvent.change(input, { target: { value: 'SPY,NFLX' } });
    fireEvent.click(screen.getByText('Apply'));
    await waitFor(() => expect(screen.getByText('2 assets')).toBeInTheDocument());
    expect(screen.queryByText('6 assets')).not.toBeInTheDocument();
    await waitFor(() => expect(apiMock.api.getMultiAssetCorrelation).toHaveBeenCalled());
    const lastCall = apiMock.api.getMultiAssetCorrelation.mock.calls.at(-1)[0];
    expect(lastCall.symbols).toEqual(['SPY', 'NFLX']);
    expect(lastCall.datasetIds).toEqual([spyDataset.datasetId, nflxDataset.datasetId]);
  });

  it('clears stale selected correlation dataset ids on mount before API calls', async () => {
    localStorage.setItem(MACRO_SELECTED_DATASET_STORAGE_KEY, 'deleted_dataset_id');
    useHistoricalDataStore.setState({ datasets: [spyDataset, nflxDataset], selectedCorrelationDatasetId: null, selectedCorrelationDataset: null });
    useMacroStore.setState({ correlationDatasetId: 'deleted_dataset_id', selectedCorrelationDatasetId: 'deleted_dataset_id', selectedCorrelationDataset: null });
    render(<MacroWorkspace />);
    await waitFor(() => expect(useMacroStore.getState().correlationDatasetId).toBeNull());
    expect(localStorage.getItem(MACRO_SELECTED_DATASET_STORAGE_KEY)).toBeNull();
    expect(apiMock.api.getMultiAssetCorrelation.mock.calls.every(([params]) => params.datasetId !== 'deleted_dataset_id')).toBe(true);
  });

  it('resolves compatible SPY and NFLX single-symbol datasets as ready_multi_dataset', () => {
    const result = resolveCompatibleDatasetsFromRegistry({ symbols: ['SPY', 'NFLX'], timeframe: '1d', minimumRows: 20, selectedDatasetId: nflxDataset.datasetId, datasets: [spyDataset, nflxDataset] });
    expect(result.ok).toBe(true);
    expect(result.resolution).toBe('multi_dataset');
    expect(result.datasetIds).toEqual([spyDataset.datasetId, nflxDataset.datasetId]);
    expect(result.datasetsBySymbol).toEqual({ SPY: spyDataset.datasetId, NFLX: nflxDataset.datasetId });
  });

  it('defaults beta to NFLX vs SPY and sends the same resolved datasetIds', async () => {
    render(<MacroWorkspace />);
    await waitFor(() => expect(apiMock.api.getMultiAssetBeta).toHaveBeenCalled());
    const lastCall = apiMock.api.getMultiAssetBeta.mock.calls.at(-1)[0];
    expect(lastCall.symbol).toBe('NFLX');
    expect(lastCall.asset).toBe('NFLX');
    expect(lastCall.benchmark).toBe('SPY');
    expect(lastCall.symbol).not.toBe(lastCall.benchmark);
    expect(lastCall.symbols).toEqual(['SPY', 'NFLX']);
    expect(lastCall.datasetIds).toEqual([spyDataset.datasetId, nflxDataset.datasetId]);
  });
});
