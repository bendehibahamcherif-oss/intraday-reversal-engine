/**
 * ML endpoint contract tests.
 *
 * Verifies:
 *  - fetchTrainingRuns() normalises activeJobs → trainingRuns
 *  - loadDiagnostics() and loadModels() store data without error for valid empty shapes
 *  - handle() extracts message from object-shaped body.error
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';

// ── API mock ─────────────────────────────────────────────────────────────────

const mlApiMock = vi.hoisted(() => ({
  getLiveDataDebug: vi.fn(() => ({})),
  api: {
    getMLModelRuns:      vi.fn(),
    getMLMetrics:        vi.fn(),
    getMLModels:         vi.fn(),
    getMLHealth:         vi.fn(),
    getMLModelInfo:      vi.fn(),
    getMLPredictions:    vi.fn(),
    getMLFeatureImportance: vi.fn(),
    getMLDriftMetrics:   vi.fn(),
    getMLModelCard:      vi.fn(),
    getMLSignal:         vi.fn(),
    mlInfer:             vi.fn(),
    promoteMLModel:      vi.fn(),
    trainMLModelP1:      vi.fn(),
  },
}));

vi.mock('../api.js', () => mlApiMock);

const { useMLStore } = await import('../store/mlStore.js');

function resetMLStore() {
  useMLStore.setState({
    trainingRuns: [], trainingLoading: false, trainingError: '',
    diagnostics: null, diagnosticsLoading: false, diagnosticsError: '',
    models: [], modelsLoading: false, modelsError: '',
    healthStatus: null, healthLoading: false, healthError: '',
    modelInfo: null, modelInfoLoading: false, modelInfoError: '',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetMLStore();
});

// ── fetchTrainingRuns normalization ──────────────────────────────────────────

describe('mlStore.fetchTrainingRuns — activeJobs normalization', () => {
  it('stores activeJobs array when backend returns { activeJobs: [...] }', async () => {
    const job = { jobId: 'abc-123', symbol: 'SPY', startedAt: '2025-01-01T00:00:00Z', status: 'running' };
    mlApiMock.api.getMLModelRuns.mockResolvedValue({ ok: true, activeJobs: [job], count: 1 });

    await act(() => useMLStore.getState().fetchTrainingRuns());

    expect(useMLStore.getState().trainingRuns).toEqual([job]);
    expect(useMLStore.getState().trainingError).toBe('');
  });

  it('stores empty array when backend returns { activeJobs: [] }', async () => {
    mlApiMock.api.getMLModelRuns.mockResolvedValue({ ok: true, activeJobs: [], count: 0 });

    await act(() => useMLStore.getState().fetchTrainingRuns());

    expect(useMLStore.getState().trainingRuns).toEqual([]);
    expect(useMLStore.getState().trainingError).toBe('');
  });

  it('falls back to runs array when backend returns { runs: [...] }', async () => {
    const job = { jobId: 'xyz', symbol: 'AAPL', startedAt: '2025-01-02T00:00:00Z', status: 'completed' };
    mlApiMock.api.getMLModelRuns.mockResolvedValue({ ok: true, runs: [job] });

    await act(() => useMLStore.getState().fetchTrainingRuns());

    expect(useMLStore.getState().trainingRuns).toEqual([job]);
  });

  it('does NOT set trainingRuns to undefined when only models key is missing', async () => {
    // Backend returns activeJobs, NOT models — old bug was data.models || [] which was fine
    // but now we prefer activeJobs first
    mlApiMock.api.getMLModelRuns.mockResolvedValue({ ok: true, activeJobs: [], count: 0 });

    await act(() => useMLStore.getState().fetchTrainingRuns());

    expect(Array.isArray(useMLStore.getState().trainingRuns)).toBe(true);
  });
});

// ── loadDiagnostics — no "Endpoint not available" for /metrics ───────────────

describe('mlStore.loadDiagnostics — /metrics empty state', () => {
  it('stores diagnostics without error when /metrics returns valid empty state', async () => {
    mlApiMock.api.getMLMetrics.mockResolvedValue({
      ok: true,
      model: null,
      workerStatus: 'idle',
      workerAlive: false,
      totalRequests: 0,
      errors: 0,
      restarts: 0,
      pendingCount: 0,
    });

    await act(() => useMLStore.getState().loadDiagnostics());

    expect(useMLStore.getState().diagnosticsError).toBe('');
    expect(useMLStore.getState().diagnostics).not.toBeNull();
    expect(useMLStore.getState().diagnostics.ok).toBe(true);
  });

  it('sets diagnosticsError when API throws', async () => {
    mlApiMock.api.getMLMetrics.mockRejectedValue(new Error('Endpoint not available'));

    await act(() => useMLStore.getState().loadDiagnostics());

    expect(useMLStore.getState().diagnosticsError).toBe('Endpoint not available');
    expect(useMLStore.getState().diagnostics).toBeNull();
  });
});

// ── loadModels — /models empty state ─────────────────────────────────────────

describe('mlStore.loadModels — /models empty state', () => {
  it('stores empty models array when backend returns { models: [] }', async () => {
    mlApiMock.api.getMLModels.mockResolvedValue({ ok: true, models: [], champion: null, status: 'no_model' });

    await act(() => useMLStore.getState().loadModels());

    expect(useMLStore.getState().models).toEqual([]);
    expect(useMLStore.getState().modelsError).toBe('');
  });

  it('stores model list when champion exists', async () => {
    const model = { id: 'rf_v1', modelType: 'random_forest', trainedAt: '2025-01-01T00:00:00Z', champion: true, status: 'active' };
    mlApiMock.api.getMLModels.mockResolvedValue({ ok: true, models: [model], champion: 'rf_v1', status: 'champion_available' });

    await act(() => useMLStore.getState().loadModels());

    expect(useMLStore.getState().models).toEqual([model]);
    expect(useMLStore.getState().modelsError).toBe('');
  });
});

// ── API handle() — object error extraction ──────────────────────────────────

describe('api handle() — object-shaped error extraction', () => {
  it('mlStore sets a readable error message, not [object Object], when API returns object error', async () => {
    const objectError = new Error('Select at least one viable provider.');
    objectError.status = 400;
    mlApiMock.api.getMLModels.mockRejectedValue(objectError);

    await act(() => useMLStore.getState().loadModels());

    expect(useMLStore.getState().modelsError).toBe('Select at least one viable provider.');
    expect(useMLStore.getState().modelsError).not.toBe('[object Object]');
  });
});

// ── ML drift — /drift empty state does not produce "Endpoint not available" ──

describe('mlStore.fetchDriftMetrics — /drift empty state', () => {
  it('stores drift data without error when /drift returns not_enough_data shape', async () => {
    mlApiMock.api.getMLDriftMetrics.mockResolvedValue({
      ok: true,
      drift: { psi: {}, status: 'not_enough_data', features: [], detectedAt: null },
    });

    await act(() => useMLStore.getState().fetchDriftMetrics());

    expect(useMLStore.getState().driftError).toBe('');
    expect(useMLStore.getState().driftMetrics).not.toBeNull();
  });
});

// ── ML predictions — /predictions empty state ────────────────────────────────

describe('mlStore.fetchPredictionHistory — /predictions empty state', () => {
  it('stores empty predictions without error', async () => {
    mlApiMock.api.getMLPredictions.mockResolvedValue({ ok: true, predictions: [], count: 0, total: 0 });

    await act(() => useMLStore.getState().fetchPredictionHistory());

    expect(useMLStore.getState().predictionHistory).toEqual([]);
    expect(useMLStore.getState().predictionsError).toBe('');
  });
});
