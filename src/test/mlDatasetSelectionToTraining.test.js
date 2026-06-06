/**
 * ML dataset selection → training payload integration tests.
 *
 * Covers the full chain:
 *   historicalDataStore.useDatasetForMl → selectedMlDatasetId
 *   aiLabStore.setSelectedDataset → selectedMlDatasetId
 *   aiLabStore.trainModel → datasetId in API payload
 *   mlStore.startTraining → datasetId in API payload (via pendingDatasetId)
 *   Bootstrap: historicalDataStore.selectedMlDatasetId survives workspace navigation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';

// ── API mock ──────────────────────────────────────────────────────────────────

const apiMock = vi.hoisted(() => ({
  api: {
    getHistoricalProviders:          vi.fn(),
    getHistoricalDatasets:           vi.fn(),
    getHistoricalDataset:            vi.fn(),
    deleteHistoricalDataset:         vi.fn(),
    downloadHistoricalData:          vi.fn(),
    getHistoricalDatasetDiagnostics: vi.fn(),
    trainMLModel:                    vi.fn(),
    trainMLModelP1:                  vi.fn(),
    getMLModelRuns:                  vi.fn(),
    getMLModelRegistry:              vi.fn(),
    getMultiAssetCorrelation:        vi.fn(),
    runBacktest:                     vi.fn(),
  },
}));

vi.mock('../api.js', () => apiMock);

const { useHistoricalDataStore } = await import('../store/historicalDataStore.js');
const { useMLStore }             = await import('../store/mlStore.js');
const { useAILabStore }          = await import('../store/aiLabStore.js');

const DATASET = {
  datasetId: 'hist_SPY_1d_RTH_202506_202606_yahoo',
  symbols: ['SPY'],
  timeframe: '1d',
  startDate: '2025-06-01',
  endDate: '2026-06-01',
  rowCount: 251,
  provider: 'yahoo',
  session: 'RTH',
  purpose: 'ml',
  files: { csv: '/data/historical/hist_SPY_1d_RTH_202506_202606_yahoo.csv' },
  status: 'ready',
  fileExists: true,
};

function resetStores() {
  useHistoricalDataStore.setState({
    providers: [], providersLoading: false, providersError: '',
    datasets: [DATASET], datasetsLoading: false, datasetsError: '',
    downloadLoading: false, downloadError: '', downloadResult: null,
    selectedDatasetId: null, selectedDataset: null,
    selectedMlDatasetId: null, selectedMlDataset: null,
    selectedBacktestDatasetId: null, selectedBacktestDataset: null,
    selectedCorrelationDatasetId: null, selectedCorrelationDataset: null,
    diagnostics: null, diagnosticsLoading: false, diagnosticsError: '',
  });
  useMLStore.setState({
    trainingRuns: [], trainingLoading: false, trainingError: '',
    trainingInProgress: false, lastTrainingResult: null,
    pendingDatasetId: null,
  });
  useAILabStore.setState({
    selectedMlDatasetId: null,
    selectedMlDataset: null,
    trainLoading: false,
    trainError: '',
    trainingJob: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStores();
});

// ══════════════════════════════════════════════════════════════════════════════
// historicalDataStore.useDatasetForMl — writes selectedMlDatasetId
// ══════════════════════════════════════════════════════════════════════════════

describe('historicalDataStore.useDatasetForMl', () => {
  it('saves selectedMlDatasetId when dataset has datasetId field', () => {
    act(() => useHistoricalDataStore.getState().useDatasetForMl(DATASET));

    expect(useHistoricalDataStore.getState().selectedMlDatasetId).toBe(DATASET.datasetId);
  });

  it('saves selectedMlDataset (normalized) with rowCount', () => {
    act(() => useHistoricalDataStore.getState().useDatasetForMl(DATASET));

    const stored = useHistoricalDataStore.getState().selectedMlDataset;
    expect(stored).not.toBeNull();
    expect(stored.datasetId).toBe(DATASET.datasetId);
    expect(stored.rowCount).toBe(251);
  });

  it('returns ok:false and does NOT set selectedMlDatasetId when dataset has no id', () => {
    const result = useHistoricalDataStore.getState().useDatasetForMl({ symbols: ['SPY'] });

    expect(result.ok).toBe(false);
    expect(useHistoricalDataStore.getState().selectedMlDatasetId).toBeNull();
  });

  it('returns ok:true with the real datasetId (never "undefined")', () => {
    const result = useHistoricalDataStore.getState().useDatasetForMl(DATASET);

    expect(result.ok).toBe(true);
    expect(result.datasetId).toBe(DATASET.datasetId);
    expect(result.datasetId).not.toBe('undefined');
    expect(String(result.datasetId)).not.toContain('undefined');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// aiLabStore.setSelectedDataset
// ══════════════════════════════════════════════════════════════════════════════

describe('aiLabStore.setSelectedDataset', () => {
  it('sets selectedMlDatasetId', () => {
    act(() => useAILabStore.getState().setSelectedDataset(DATASET.datasetId, DATASET));

    expect(useAILabStore.getState().selectedMlDatasetId).toBe(DATASET.datasetId);
  });

  it('sets selectedMlDataset with normalized dataset', () => {
    act(() => useAILabStore.getState().setSelectedDataset(DATASET.datasetId, DATASET));

    const ds = useAILabStore.getState().selectedMlDataset;
    expect(ds?.rowCount).toBe(251);
    expect(ds?.datasetId).toBe(DATASET.datasetId);
  });

  it('sets trainError when no id can be extracted', () => {
    act(() => useAILabStore.getState().setSelectedDataset(null, null));

    expect(useAILabStore.getState().trainError).toBeTruthy();
    expect(useAILabStore.getState().selectedMlDatasetId).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// aiLabStore.trainModel — datasetId in API payload
// ══════════════════════════════════════════════════════════════════════════════

describe('aiLabStore.trainModel — payload includes datasetId', () => {
  beforeEach(() => {
    apiMock.api.trainMLModel.mockResolvedValue({ ok: true, status: 'trained', modelId: 'rf_v1' });
    apiMock.api.getMLModelRegistry.mockResolvedValue({ ok: true, models: [] });
  });

  it('includes datasetId in the API call when selectedMlDatasetId is set', async () => {
    useAILabStore.setState({ selectedMlDatasetId: DATASET.datasetId, selectedMlDataset: DATASET });

    await act(() => useAILabStore.getState().trainModel());

    expect(apiMock.api.trainMLModel).toHaveBeenCalledOnce();
    const [symbol, config] = apiMock.api.trainMLModel.mock.calls[0];
    expect(config.datasetId).toBe(DATASET.datasetId);
  });

  it('does NOT include datasetId when selectedMlDatasetId is null', async () => {
    useAILabStore.setState({ selectedMlDatasetId: null });

    await act(() => useAILabStore.getState().trainModel());

    const [, config] = apiMock.api.trainMLModel.mock.calls[0];
    expect(config.datasetId).toBeUndefined();
  });

  it('never sends datasetId:"undefined" string', async () => {
    useAILabStore.setState({ selectedMlDatasetId: DATASET.datasetId });

    await act(() => useAILabStore.getState().trainModel());

    const [, config] = apiMock.api.trainMLModel.mock.calls[0];
    expect(String(config.datasetId || '')).not.toBe('undefined');
  });

  it('stores training job result including status', async () => {
    apiMock.api.trainMLModel.mockResolvedValue({ ok: true, status: 'trained', modelId: 'rf_v2' });
    useAILabStore.setState({ selectedMlDatasetId: DATASET.datasetId });

    await act(() => useAILabStore.getState().trainModel());

    const job = useAILabStore.getState().trainingJob;
    expect(job?.status || job?.ok).toBeTruthy();
    expect(useAILabStore.getState().trainLoading).toBe(false);
    expect(useAILabStore.getState().trainError).toBe('');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Bootstrap behavior: historicalDataStore survives workspace navigation
// ══════════════════════════════════════════════════════════════════════════════

describe('Bootstrap: selectedMlDatasetId persists in historicalDataStore across navigation', () => {
  it('historicalDataStore retains selectedMlDatasetId after useDatasetForMl', () => {
    act(() => useHistoricalDataStore.getState().useDatasetForMl(DATASET));

    // Simulate navigation away (other workspaces unmount — state in store persists)
    const persisted = useHistoricalDataStore.getState().selectedMlDatasetId;
    expect(persisted).toBe(DATASET.datasetId);
  });

  it('aiLabStore can bootstrap from historicalDataStore.selectedMlDatasetId on mount', () => {
    // Simulate: user clicked "Use for ML" while on HistoricalData workspace
    act(() => useHistoricalDataStore.getState().useDatasetForMl(DATASET));

    // Simulate: AILabWorkspace mounts later; bootstrap reads from historicalDataStore
    const { selectedMlDatasetId: histId, selectedMlDataset: histDataset } =
      useHistoricalDataStore.getState();

    if (histId && !useAILabStore.getState().selectedMlDatasetId) {
      act(() => useAILabStore.getState().setSelectedDataset(histId, histDataset));
    }

    expect(useAILabStore.getState().selectedMlDatasetId).toBe(DATASET.datasetId);
  });

  it('mlStore can bootstrap from historicalDataStore.selectedMlDatasetId on mount', () => {
    // Simulate: user clicked "Use for ML" while on HistoricalData workspace
    act(() => useHistoricalDataStore.getState().useDatasetForMl(DATASET));

    // Simulate: MLDashboard mounts later; bootstrap reads from historicalDataStore
    const { selectedMlDatasetId: histId, selectedMlDataset: histDataset } =
      useHistoricalDataStore.getState();

    if (histId && !useMLStore.getState().pendingDatasetId) {
      act(() => useMLStore.getState().setPendingDatasetId(histId, histDataset));
    }

    expect(useMLStore.getState().pendingDatasetId).toBe(DATASET.datasetId);
  });

  it('after bootstrap, aiLabStore.trainModel sends the correct datasetId', async () => {
    apiMock.api.trainMLModel.mockResolvedValue({ ok: true, status: 'trained', modelId: 'rf_v3' });
    apiMock.api.getMLModelRegistry.mockResolvedValue({ ok: true, models: [] });

    // Full flow: user selects dataset → navigates to AILab → bootstrap → train
    act(() => useHistoricalDataStore.getState().useDatasetForMl(DATASET));
    const { selectedMlDatasetId: histId, selectedMlDataset: histDataset } =
      useHistoricalDataStore.getState();
    act(() => useAILabStore.getState().setSelectedDataset(histId, histDataset));

    await act(() => useAILabStore.getState().trainModel());

    const [, config] = apiMock.api.trainMLModel.mock.calls[0];
    expect(config.datasetId).toBe(DATASET.datasetId);
  });

  it('after bootstrap, mlStore.startTraining sends the correct datasetId', async () => {
    apiMock.api.trainMLModelP1.mockResolvedValue({ ok: true, status: 'trained', modelId: 'rf_v4' });
    apiMock.api.getMLModelRuns.mockResolvedValue({ ok: true, runs: [] });

    // Full flow: user selects dataset → navigates to MLDashboard → bootstrap → train
    act(() => useHistoricalDataStore.getState().useDatasetForMl(DATASET));
    const { selectedMlDatasetId: histId, selectedMlDataset: histDataset } =
      useHistoricalDataStore.getState();
    act(() => useMLStore.getState().setPendingDatasetId(histId, histDataset));

    await act(() => useMLStore.getState().startTraining({ symbol: 'SPY', timeframe: '1d' }));

    const callArg = apiMock.api.trainMLModelP1.mock.calls[0][0];
    expect(callArg.datasetId).toBe(DATASET.datasetId);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Guard: never dataset_missing when datasetId is provided
// ══════════════════════════════════════════════════════════════════════════════

describe('Backend contract: dataset_not_found not dataset_missing when datasetId given', () => {
  it('aiLabStore.trainingJob reflects dataset_not_found when backend returns it', async () => {
    apiMock.api.trainMLModel.mockResolvedValue({
      ok: false,
      status: 'dataset_not_found',
      message: `Dataset 'hist_GHOST' not found`,
      datasetId: 'hist_GHOST',
    });
    apiMock.api.getMLModelRegistry.mockResolvedValue({ ok: true, models: [] });

    useAILabStore.setState({ selectedMlDatasetId: 'hist_GHOST' });

    await act(() => useAILabStore.getState().trainModel());

    // aiLabStore stores the full result as trainingJob (displayed as Status: dataset_not_found)
    const job = useAILabStore.getState().trainingJob;
    expect(job?.status).toBe('dataset_not_found');
    expect(job?.status).not.toBe('dataset_missing');
  });

  it('trainMLModelP1 is called with datasetId when pendingDatasetId set (mlStore path)', async () => {
    apiMock.api.trainMLModelP1.mockResolvedValue({ ok: true, status: 'trained', modelId: 'rf_v5' });
    apiMock.api.getMLModelRuns.mockResolvedValue({ ok: true, runs: [] });

    useMLStore.setState({ pendingDatasetId: DATASET.datasetId });
    await act(() => useMLStore.getState().startTraining({ symbol: 'SPY', timeframe: '1d' }));

    const callArg = apiMock.api.trainMLModelP1.mock.calls[0][0];
    expect(callArg.datasetId).toBe(DATASET.datasetId);
    expect(callArg.datasetId).not.toBeUndefined();
  });
});
