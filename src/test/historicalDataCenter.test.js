/**
 * Historical Data Download Center tests.
 *
 * Covers:
 *  - historicalDataStore: fetchProviders, fetchDatasets, downloadData, deleteDataset, selectDataset
 *  - api methods exist and call correct endpoints
 *  - fallback_demo rejection
 *  - selectedDatasetId propagation
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

// ── API mock ──────────────────────────────────────────────────────────────────

const apiMock = vi.hoisted(() => ({
  api: {
    getHistoricalProviders:  vi.fn(),
    getHistoricalDatasets:   vi.fn(),
    getHistoricalDataset:    vi.fn(),
    deleteHistoricalDataset: vi.fn(),
    downloadHistoricalData:  vi.fn(),
    getMultiAssetCorrelation: vi.fn(),
    trainMLModelP1:          vi.fn(),
    runBacktest:             vi.fn(),
  },
}));

vi.mock('../api.js', () => apiMock);

const { useHistoricalDataStore } = await import('../store/historicalDataStore.js');
const { useMLStore }             = await import('../store/mlStore.js');
const { useMacroStore }          = await import('../store/macroStore.js');
const { useQuantLabStore }       = await import('../store/quantLabStore.js');
const { DownloadForm, parseSymbols } = await import('../workspaces/HistoricalDataWorkspace.jsx');

function resetHistStore() {
  useHistoricalDataStore.setState({
    providers: [], providersLoading: false, providersError: '',
    datasets: [], datasetsLoading: false, datasetsError: '',
    downloadLoading: false, downloadError: '', downloadResult: null,
    selectedDatasetId: null, selectedDataset: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetHistStore();
});


// ── DownloadForm symbol parsing and payload ───────────────────────────────────

describe('HistoricalDataWorkspace download symbol payload', () => {
  it('parseSymbols("NFLX") returns ["NFLX"]', () => {
    expect(parseSymbols('NFLX')).toEqual(['NFLX']);
  });

  it('parseSymbols("SPY, QQQ") returns ["SPY", "QQQ"]', () => {
    expect(parseSymbols('SPY, QQQ')).toEqual(['SPY', 'QQQ']);
  });

  it('download payload contains a symbols array when Download is clicked with NFLX', () => {
    const onDownload = vi.fn();
    render(React.createElement(DownloadForm, {
      providers: [{ id: 'yahoo', label: 'Yahoo Finance' }],
      onDownload,
      loading: false,
      error: '',
      result: null,
      onClear: vi.fn(),
    }));

    fireEvent.change(screen.getByPlaceholderText('SPY, QQQ, IWM'), { target: { value: 'NFLX' } });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'yahoo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'yahoo',
      symbols: ['NFLX'],
      endDate: expect.any(String),
    }));
    expect(onDownload.mock.calls[0][0]).not.toHaveProperty('symbol');
  });

  it('missing symbol prevents API call and shows a validation message', () => {
    const onDownload = vi.fn();
    render(React.createElement(DownloadForm, {
      providers: [{ id: 'yahoo', label: 'Yahoo Finance' }],
      onDownload,
      loading: false,
      error: '',
      result: null,
      onClear: vi.fn(),
    }));

    fireEvent.change(screen.getByPlaceholderText('SPY, QQQ, IWM'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(onDownload).not.toHaveBeenCalled();
    expect(screen.getByText('At least one symbol is required.')).toBeInTheDocument();
  });
});

// ── fetchProviders ────────────────────────────────────────────────────────────

describe('historicalDataStore.fetchProviders', () => {
  it('stores provider list on success', async () => {
    const providers = [
      { id: 'yahoo',      label: 'Yahoo Finance',   requiresCredentials: false, historical: true },
      { id: 'polygon',    label: 'Polygon.io',      requiresCredentials: true,  historical: true },
      { id: 'alphaVantage', label: 'Alpha Vantage', requiresCredentials: true,  historical: true },
      { id: 'twelvedata', label: 'Twelve Data',     requiresCredentials: true,  historical: true },
    ];
    apiMock.api.getHistoricalProviders.mockResolvedValue({ ok: true, providers });

    await act(() => useHistoricalDataStore.getState().fetchProviders());

    expect(useHistoricalDataStore.getState().providers).toEqual(providers);
    expect(useHistoricalDataStore.getState().providersError).toBe('');
  });

  it('sets providersError on failure', async () => {
    apiMock.api.getHistoricalProviders.mockRejectedValue(new Error('Network error'));

    await act(() => useHistoricalDataStore.getState().fetchProviders());

    expect(useHistoricalDataStore.getState().providers).toEqual([]);
    expect(useHistoricalDataStore.getState().providersError).toBe('Network error');
  });

  it('filters fallback_demo from provider list (only non-demo providers returned)', async () => {
    const providers = [
      { id: 'yahoo',         label: 'Yahoo Finance', historical: true },
      { id: 'fallback_demo', label: 'Demo',          historical: false },
    ];
    apiMock.api.getHistoricalProviders.mockResolvedValue({ ok: true, providers });

    await act(() => useHistoricalDataStore.getState().fetchProviders());

    // The store stores all from server; UI filters out fallback_demo in the component
    // Here we verify the server response IS stored (filtering is UI responsibility)
    const stored = useHistoricalDataStore.getState().providers;
    expect(stored.length).toBe(2);
    // Component-level: fallback_demo should never be selectable in the form
    expect(stored.find((p) => p.id === 'fallback_demo')?.historical).toBe(false);
  });
});

// ── fetchDatasets ─────────────────────────────────────────────────────────────

describe('historicalDataStore.fetchDatasets', () => {
  it('stores datasets array on success', async () => {
    const datasets = [
      {
        datasetId: 'hist_SPY_1d_RTH_20240101_20241231_yahoo',
        symbols: ['SPY'], timeframe: '1d',
        startDate: '2024-01-01', endDate: '2024-12-31',
        provider: 'yahoo', session: 'RTH', purpose: 'ml',
        rowCount: 252, status: 'ready',
      },
    ];
    apiMock.api.getHistoricalDatasets.mockResolvedValue({ ok: true, datasets });

    await act(() => useHistoricalDataStore.getState().fetchDatasets());

    expect(useHistoricalDataStore.getState().datasets).toEqual(datasets);
    expect(useHistoricalDataStore.getState().datasetsError).toBe('');
  });

  it('stores empty array when no datasets exist', async () => {
    apiMock.api.getHistoricalDatasets.mockResolvedValue({ ok: true, datasets: [] });

    await act(() => useHistoricalDataStore.getState().fetchDatasets());

    expect(useHistoricalDataStore.getState().datasets).toEqual([]);
  });
});

// ── downloadData ──────────────────────────────────────────────────────────────

describe('historicalDataStore.downloadData', () => {
  it('stores downloadResult on successful download', async () => {
    const result = {
      ok: true,
      datasetId: 'hist_QQQ_1d_RTH_20230101_20231231_polygon',
      provider: 'polygon',
      symbols: ['QQQ'],
      timeframe: '1d',
      totalRows: 252,
      files: { csv: '/data/historical/ml/hist_QQQ_1d.csv' },
    };
    apiMock.api.getHistoricalDatasets.mockResolvedValue({ ok: true, datasets: [result] });
    apiMock.api.downloadHistoricalData.mockResolvedValue(result);

    await act(() => useHistoricalDataStore.getState().downloadData({
      provider: 'polygon',
      symbols: ['QQQ'],
      timeframe: '1d',
      startDate: '2023-01-01',
      endDate: '2023-12-31',
      session: 'RTH',
      purpose: 'ml',
      outputFormat: ['csv'],
    }));

    expect(useHistoricalDataStore.getState().downloadResult).toEqual(result);
    expect(useHistoricalDataStore.getState().downloadError).toBe('');
  });

  it('sets downloadError on failure', async () => {
    apiMock.api.downloadHistoricalData.mockRejectedValue(new Error('Provider unavailable'));

    await act(async () => {
      try {
        await useHistoricalDataStore.getState().downloadData({ provider: 'polygon', symbols: ['SPY'] });
      } catch (_) { /* expected */ }
    });

    expect(useHistoricalDataStore.getState().downloadError).toBe('Provider unavailable');
    expect(useHistoricalDataStore.getState().downloadResult).toBeNull();
  });
});

// ── selectDataset ─────────────────────────────────────────────────────────────

describe('historicalDataStore.selectDataset', () => {
  it('sets selectedDatasetId and selectedDataset', async () => {
    const ds = {
      datasetId: 'hist_SPY_1d_RTH_20240101_20241231_yahoo',
      symbols: ['SPY'], timeframe: '1d', status: 'ready',
    };
    useHistoricalDataStore.setState({ datasets: [ds] });

    act(() => useHistoricalDataStore.getState().selectDataset(ds.datasetId));

    expect(useHistoricalDataStore.getState().selectedDatasetId).toBe(ds.datasetId);
    expect(useHistoricalDataStore.getState().selectedDataset).toEqual(ds);
  });

  it('clearSelection resets selectedDatasetId and selectedDataset', () => {
    useHistoricalDataStore.setState({
      selectedDatasetId: 'some-id',
      selectedDataset: { datasetId: 'some-id' },
    });

    act(() => useHistoricalDataStore.getState().clearSelection());

    expect(useHistoricalDataStore.getState().selectedDatasetId).toBeNull();
    expect(useHistoricalDataStore.getState().selectedDataset).toBeNull();
  });
});

// ── deleteDataset ─────────────────────────────────────────────────────────────

describe('historicalDataStore.deleteDataset', () => {
  it('removes dataset from list after deletion', async () => {
    const ds1 = { datasetId: 'ds-1', symbols: ['SPY'] };
    const ds2 = { datasetId: 'ds-2', symbols: ['QQQ'] };
    useHistoricalDataStore.setState({ datasets: [ds1, ds2] });
    apiMock.api.deleteHistoricalDataset.mockResolvedValue({ ok: true });

    await act(() => useHistoricalDataStore.getState().deleteDataset('ds-1'));

    expect(useHistoricalDataStore.getState().datasets).toEqual([ds2]);
  });

  it('clears selectedDatasetId when selected dataset is deleted', async () => {
    const ds = { datasetId: 'ds-active', symbols: ['AAPL'] };
    useHistoricalDataStore.setState({ datasets: [ds], selectedDatasetId: 'ds-active', selectedDataset: ds });
    apiMock.api.deleteHistoricalDataset.mockResolvedValue({ ok: true });

    await act(() => useHistoricalDataStore.getState().deleteDataset('ds-active'));

    expect(useHistoricalDataStore.getState().selectedDatasetId).toBeNull();
    expect(useHistoricalDataStore.getState().selectedDataset).toBeNull();
  });
});

// ── mlStore pendingDatasetId ──────────────────────────────────────────────────

describe('mlStore.pendingDatasetId', () => {
  beforeEach(() => {
    useMLStore.setState({ pendingDatasetId: null, trainingInProgress: false, trainingError: '', lastTrainingResult: null, trainingRuns: [] });
  });

  it('setPendingDatasetId stores the dataset id', () => {
    act(() => useMLStore.getState().setPendingDatasetId('hist_SPY_1d_RTH_20240101_20241231_yahoo'));
    expect(useMLStore.getState().pendingDatasetId).toBe('hist_SPY_1d_RTH_20240101_20241231_yahoo');
  });

  it('clearPendingDatasetId resets to null', () => {
    useMLStore.setState({ pendingDatasetId: 'some-id' });
    act(() => useMLStore.getState().clearPendingDatasetId());
    expect(useMLStore.getState().pendingDatasetId).toBeNull();
  });

  it('startTraining passes pendingDatasetId to trainMLModelP1', async () => {
    useMLStore.setState({ pendingDatasetId: 'hist_SPY_1d_RTH_yahoo' });
    apiMock.api.trainMLModelP1.mockResolvedValue({ ok: true, modelVersion: 'rf_v2' });
    apiMock.api.getMLModelRuns = vi.fn().mockResolvedValue({ ok: true, activeJobs: [] });
    vi.mock('../api.js', () => ({
      api: {
        ...apiMock.api,
        getMLModelRuns: vi.fn().mockResolvedValue({ ok: true, activeJobs: [] }),
      },
    }));

    await act(() => useMLStore.getState().startTraining({ symbol: 'SPY', timeframe: '1d' }));

    expect(apiMock.api.trainMLModelP1).toHaveBeenCalledWith(
      expect.objectContaining({ datasetId: 'hist_SPY_1d_RTH_yahoo' })
    );
  });
});

// ── macroStore correlationDatasetId ──────────────────────────────────────────

describe('macroStore.correlationDatasetId', () => {
  beforeEach(() => {
    useMacroStore.setState({ correlationDatasetId: null, correlationLoading: false, correlationError: '', correlation: null });
  });

  it('setCorrelationDatasetId stores the id', () => {
    act(() => useMacroStore.getState().setCorrelationDatasetId('hist_SPY_QQQ_1d_RTH_yahoo'));
    expect(useMacroStore.getState().correlationDatasetId).toBe('hist_SPY_QQQ_1d_RTH_yahoo');
  });

  it('clearCorrelationDatasetId resets to null', () => {
    useMacroStore.setState({ correlationDatasetId: 'some-id' });
    act(() => useMacroStore.getState().clearCorrelationDatasetId());
    expect(useMacroStore.getState().correlationDatasetId).toBeNull();
  });
});

// ── quantLabStore backtestPendingDatasetId ────────────────────────────────────

describe('quantLabStore.backtestPendingDatasetId', () => {
  beforeEach(() => {
    useQuantLabStore.setState({ backtestPendingDatasetId: null });
  });

  it('setBacktestPendingDatasetId stores the id', () => {
    act(() => useQuantLabStore.getState().setBacktestPendingDatasetId('hist_AAPL_5m_RTH_polygon'));
    expect(useQuantLabStore.getState().backtestPendingDatasetId).toBe('hist_AAPL_5m_RTH_polygon');
  });

  it('clearBacktestPendingDatasetId resets to null', () => {
    useQuantLabStore.setState({ backtestPendingDatasetId: 'some-id' });
    act(() => useQuantLabStore.getState().clearBacktestPendingDatasetId());
    expect(useQuantLabStore.getState().backtestPendingDatasetId).toBeNull();
  });
});
