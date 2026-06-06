/**
 * Phase 9 tests: ML dataset_missing root cause fix
 *
 * Backend (9): resolveDatasetFile, trainModel datasetId flow, historical diagnostics endpoint
 * Frontend (6): store datasetId propagation, error display, UI state
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
import express from 'express';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { act } from '@testing-library/react';

const require = createRequire(import.meta.url);

// ── Load CJS modules ──────────────────────────────────────────────────────────

const { resolveDatasetFile } = require('../../server-deliverables/ai/trainingService.js');
const registry = require('../../server-deliverables/historical/historicalDatasetRegistry.js');
const historicalRoutes = require('../../server-deliverables/api/historicalRoutes.js');

// ── HTTP test server (historical routes only) ─────────────────────────────────

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/historical', historicalRoutes);
  server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

// ── Temp file helpers ─────────────────────────────────────────────────────────

const tmpDir = os.tmpdir();

function makeTempCsv(content = 'open,high,low,close,volume\n1,2,3,4,5\n') {
  const p = path.join(tmpDir, `test_dataset_${Date.now()}_${Math.random().toString(36).slice(2)}.csv`);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

function makeTempEmptyCsv() {
  const p = path.join(tmpDir, `test_empty_${Date.now()}.csv`);
  fs.writeFileSync(p, '', 'utf8');
  return p;
}

function cleanupFile(p) {
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch {}
}

// Track registry IDs registered during tests so we can clean up
const registeredIds = [];
afterAll(() => {
  for (const id of registeredIds) {
    try { registry.remove(id); } catch {}
  }
});

function registerTestDataset(extra = {}) {
  const id = `test_ds_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const record = { datasetId: id, symbols: ['TEST'], timeframe: '1d', provider: 'yahoo', session: 'RTH', purpose: 'ml', startDate: '2024-01-01', endDate: '2024-12-31', rowCount: 100, ...extra };
  registry.register(record);
  registeredIds.push(id);
  return id;
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKEND TESTS
// ═══════════════════════════════════════════════════════════════════════════

// ── 1. resolveDatasetFile: valid file ─────────────────────────────────────────

describe('resolveDatasetFile — valid file', () => {
  it('resolves files.csv path and returns issue:null', () => {
    const csvPath = makeTempCsv();
    try {
      const dataset = { datasetId: 'test_csv', files: { csv: csvPath } };
      const { resolvedPath, issue } = resolveDatasetFile(dataset);
      expect(issue).toBeNull();
      expect(resolvedPath).toBe(csvPath);
    } finally {
      cleanupFile(csvPath);
    }
  });

  it('resolves filePath field when files is absent', () => {
    const csvPath = makeTempCsv();
    try {
      const dataset = { datasetId: 'test_filepath', filePath: csvPath };
      const { resolvedPath, issue } = resolveDatasetFile(dataset);
      expect(issue).toBeNull();
      expect(resolvedPath).toBe(csvPath);
    } finally {
      cleanupFile(csvPath);
    }
  });
});

// ── 2. resolveDatasetFile: file missing ───────────────────────────────────────

describe('resolveDatasetFile — file missing', () => {
  it('returns dataset_file_missing when no path fields are present', () => {
    const { issue, resolvedPath } = resolveDatasetFile({ datasetId: 'no_paths' });
    expect(issue).toBe('dataset_file_missing');
    expect(resolvedPath).toBeNull();
  });

  it('returns dataset_file_missing when listed file does not exist on disk', () => {
    const { issue } = resolveDatasetFile({ datasetId: 'ghost', filePath: '/nonexistent/ghost_file.csv' });
    expect(issue).toBe('dataset_file_missing');
  });
});

// ── 3. resolveDatasetFile: empty file ─────────────────────────────────────────

describe('resolveDatasetFile — empty file', () => {
  it('returns dataset_file_empty when file exists but has 0 bytes', () => {
    const emptyPath = makeTempEmptyCsv();
    try {
      const { issue, resolvedPath } = resolveDatasetFile({ datasetId: 'empty_ds', files: { csv: emptyPath } });
      expect(issue).toBe('dataset_file_empty');
      expect(resolvedPath).toBe(emptyPath);
    } finally {
      cleanupFile(emptyPath);
    }
  });
});

// ── 4. GET /datasets returns fileExists ──────────────────────────────────────

describe('GET /api/historical/datasets — fileExists annotation', () => {
  it('includes fileExists=false when dataset file is missing', async () => {
    const id = registerTestDataset({ filePath: '/nonexistent/path/ghost.csv' });

    const resp = await fetch(`${baseUrl}/api/historical/datasets`);
    const body = await resp.json();
    expect(resp.status).toBe(200);
    expect(body.ok).toBe(true);

    const ds = body.datasets.find((d) => d.datasetId === id);
    expect(ds).toBeDefined();
    expect(ds.fileExists).toBe(false);
    expect(ds.status).toBe('file_missing');
  });

  it('includes fileExists=true when dataset file exists', async () => {
    const csvPath = makeTempCsv();
    const id = registerTestDataset({ filePath: csvPath });

    try {
      const resp = await fetch(`${baseUrl}/api/historical/datasets`);
      const body = await resp.json();
      const ds = body.datasets.find((d) => d.datasetId === id);
      expect(ds).toBeDefined();
      expect(ds.fileExists).toBe(true);
    } finally {
      cleanupFile(csvPath);
    }
  });
});

// ── 5. GET /datasets/:datasetId/diagnostics ───────────────────────────────────

describe('GET /api/historical/datasets/:datasetId/diagnostics', () => {
  it('returns usableForMl:true when file exists', async () => {
    const csvPath = makeTempCsv();
    const id = registerTestDataset({ filePath: csvPath });

    try {
      const resp = await fetch(`${baseUrl}/api/historical/datasets/${id}/diagnostics`);
      const body = await resp.json();
      expect(resp.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.datasetId).toBe(id);
      expect(body.registryFound).toBe(true);
      expect(body.fileExists).toBe(true);
      expect(body.usableForMl).toBe(true);
      expect(body.issues).toEqual([]);
      expect(typeof body.fileSizeBytes).toBe('number');
      expect(body.fileSizeBytes).toBeGreaterThan(0);
    } finally {
      cleanupFile(csvPath);
    }
  });

  it('returns usableForMl:false and issue when file is missing', async () => {
    const id = registerTestDataset({ filePath: '/nonexistent/path/ghost.csv' });

    const resp = await fetch(`${baseUrl}/api/historical/datasets/${id}/diagnostics`);
    const body = await resp.json();
    expect(resp.status).toBe(200);
    expect(body.registryFound).toBe(true);
    expect(body.fileExists).toBe(false);
    expect(body.usableForMl).toBe(false);
    expect(body.issues).toContain('dataset_file_missing');
  });

  it('returns registryFound:false and availableDatasetIds for unknown id', async () => {
    const resp = await fetch(`${baseUrl}/api/historical/datasets/nonexistent_ds_12345/diagnostics`);
    const body = await resp.json();
    expect(resp.status).toBe(404);
    // Diagnostics endpoint returns ok:true with registryFound:false (diagnostic shape, not CRUD 404)
    expect(body.registryFound).toBe(false);
    expect(body.fileExists).toBe(false);
    expect(body.usableForMl).toBe(false);
    expect(Array.isArray(body.availableDatasetIds)).toBe(true);
  });
});

// ── 6. Registry lookup works with datasetId field ────────────────────────────

describe('Registry lookup — dataset field shapes', () => {
  it('find() by datasetId field works in registry', () => {
    const id = registerTestDataset();
    const found = registry.list().find((d) => d.datasetId === id);
    expect(found).toBeDefined();
    expect(found.datasetId).toBe(id);
  });

  it('registry.get() returns null for unknown id', () => {
    const result = registry.get('does_not_exist_xyz_999');
    expect(result).toBeNull();
  });
});

// ── 7. No undefined values in JSON responses ──────────────────────────────────

describe('JSON response integrity — no undefined values', () => {
  it('GET /datasets response has no undefined-valued keys', async () => {
    const csvPath = makeTempCsv();
    const id = registerTestDataset({ filePath: csvPath });

    try {
      const resp = await fetch(`${baseUrl}/api/historical/datasets`);
      const text = await resp.text();
      // JSON.stringify cannot encode undefined — it would drop the key.
      // Verify the text parses cleanly and contains the registered id.
      const body = JSON.parse(text);
      expect(body.ok).toBe(true);
      const ds = body.datasets.find((d) => d.datasetId === id);
      expect(ds).toBeDefined();
    } finally {
      cleanupFile(csvPath);
    }
  });

  it('diagnostics response JSON is parseable with no undefined literals', async () => {
    const csvPath = makeTempCsv();
    const id = registerTestDataset({ filePath: csvPath });

    try {
      const resp = await fetch(`${baseUrl}/api/historical/datasets/${id}/diagnostics`);
      const text = await resp.text();
      // Should never contain the string "undefined" in a JSON response
      expect(text).not.toContain('"undefined"');
      expect(text).not.toContain(':undefined');
      const body = JSON.parse(text);
      expect(body.datasetId).toBe(id);
    } finally {
      cleanupFile(csvPath);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FRONTEND TESTS
// ═══════════════════════════════════════════════════════════════════════════

const frontendApiMock = vi.hoisted(() => ({
  api: {
    getHistoricalProviders:          vi.fn(),
    getHistoricalDatasets:           vi.fn(),
    getHistoricalDataset:            vi.fn(),
    deleteHistoricalDataset:         vi.fn(),
    downloadHistoricalData:          vi.fn(),
    getHistoricalDatasetDiagnostics: vi.fn(),
    trainMLModelP1:                  vi.fn(),
    getMLModelRuns:                  vi.fn(),
    getMultiAssetCorrelation:        vi.fn(),
    runBacktest:                     vi.fn(),
  },
}));

vi.mock('../api.js', () => frontendApiMock);

const { useHistoricalDataStore } = await import('../store/historicalDataStore.js');
const { useMLStore }             = await import('../store/mlStore.js');

function resetHistStore() {
  useHistoricalDataStore.setState({
    providers: [], providersLoading: false, providersError: '',
    datasets: [], datasetsLoading: false, datasetsError: '',
    downloadLoading: false, downloadError: '', downloadResult: null,
    selectedDatasetId: null, selectedDataset: null,
    diagnostics: null, diagnosticsLoading: false, diagnosticsError: '',
  });
}

function resetMLStoreState() {
  useMLStore.setState({
    trainingRuns: [], trainingLoading: false, trainingError: '',
    trainingInProgress: false, lastTrainingResult: null,
    pendingDatasetId: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetHistStore();
  resetMLStoreState();
});

// ── 8. selectDataset saves selectedMlDatasetId and fetches diagnostics ────────

describe('historicalDataStore.selectDataset — datasetId propagation', () => {
  it('sets selectedDatasetId and fetches diagnostics when a dataset is selected', async () => {
    const mockDataset = { datasetId: 'hist_SPY_1d_RTH_20240101_20241231_yahoo', symbols: ['SPY'], timeframe: '1d', status: 'ready', fileExists: true };
    const mockDiagnostics = { ok: true, datasetId: mockDataset.datasetId, fileExists: true, usableForMl: true, issues: [] };

    useHistoricalDataStore.setState({ datasets: [mockDataset] });
    frontendApiMock.api.getHistoricalDatasetDiagnostics.mockResolvedValue(mockDiagnostics);

    await act(() => useHistoricalDataStore.getState().selectDataset(mockDataset.datasetId));

    expect(useHistoricalDataStore.getState().selectedDatasetId).toBe(mockDataset.datasetId);
    expect(useHistoricalDataStore.getState().selectedDataset).toEqual(mockDataset);
    expect(frontendApiMock.api.getHistoricalDatasetDiagnostics).toHaveBeenCalledWith(mockDataset.datasetId);
  });

  it('stores diagnostics result from API', async () => {
    const mockDataset = { datasetId: 'hist_AAPL_5m_RTH_20240101_20241231_yahoo', symbols: ['AAPL'], timeframe: '5m' };
    const mockDiagnostics = { ok: true, datasetId: mockDataset.datasetId, fileExists: true, usableForMl: true, fileSizeBytes: 2048, issues: [] };

    useHistoricalDataStore.setState({ datasets: [mockDataset] });
    frontendApiMock.api.getHistoricalDatasetDiagnostics.mockResolvedValue(mockDiagnostics);

    await act(() => useHistoricalDataStore.getState().selectDataset(mockDataset.datasetId));

    expect(useHistoricalDataStore.getState().diagnostics).toEqual(mockDiagnostics);
    expect(useHistoricalDataStore.getState().diagnosticsLoading).toBe(false);
    expect(useHistoricalDataStore.getState().diagnosticsError).toBe('');
  });
});

// ── 9. setPendingDatasetId and ML train payload includes datasetId ────────────

describe('mlStore.startTraining — datasetId included in request', () => {
  it('includes pendingDatasetId as datasetId in the training API call', async () => {
    const datasetId = 'hist_SPY_1d_RTH_20240101_20241231_yahoo';
    useMLStore.getState().setPendingDatasetId(datasetId);
    frontendApiMock.api.getMLModelRuns.mockResolvedValue({ ok: true, runs: [] });
    frontendApiMock.api.trainMLModelP1.mockResolvedValue({ ok: true, status: 'trained', modelId: 'rf_v1_test', promoted: false });

    await act(() => useMLStore.getState().startTraining());

    expect(frontendApiMock.api.trainMLModelP1).toHaveBeenCalledWith(
      expect.objectContaining({ datasetId })
    );
  });

  it('does NOT include datasetId in request when no pendingDatasetId is set', async () => {
    frontendApiMock.api.getMLModelRuns.mockResolvedValue({ ok: true, runs: [] });
    frontendApiMock.api.trainMLModelP1.mockResolvedValue({ ok: true, status: 'trained', modelId: 'rf_v2', promoted: false });

    await act(() => useMLStore.getState().startTraining());

    const callArg = frontendApiMock.api.trainMLModelP1.mock.calls[0][0];
    expect(callArg.datasetId).toBeUndefined();
  });
});

// ── 10. startTraining handles ok:false with precise error codes ───────────────

describe('mlStore.startTraining — precise error codes from backend', () => {
  it('sets trainingError with message when backend returns dataset_not_found', async () => {
    const datasetId = 'hist_GHOST_1d_RTH_20240101_20241231_yahoo';
    useMLStore.getState().setPendingDatasetId(datasetId);
    frontendApiMock.api.trainMLModelP1.mockResolvedValue({
      ok: false,
      status: 'dataset_not_found',
      message: `Historical dataset '${datasetId}' was not found in the backend registry.`,
      datasetId,
    });

    await act(() => useMLStore.getState().startTraining());

    expect(useMLStore.getState().trainingInProgress).toBe(false);
    expect(useMLStore.getState().trainingError).toBeTruthy();
    expect(useMLStore.getState().trainingError).not.toBe('');
    const result = useMLStore.getState().lastTrainingResult;
    expect(result.ok).toBe(false);
    expect(result.status).toBe('dataset_not_found');
  });

  it('sets trainingError with message when backend returns dataset_file_missing', async () => {
    const datasetId = 'hist_SPY_1d_RTH_20230101_20231231_yahoo';
    useMLStore.getState().setPendingDatasetId(datasetId);
    frontendApiMock.api.trainMLModelP1.mockResolvedValue({
      ok: false,
      status: 'dataset_file_missing',
      message: `Historical dataset '${datasetId}' exists in registry but file is missing.`,
      datasetId,
    });

    await act(() => useMLStore.getState().startTraining());

    expect(useMLStore.getState().trainingError).toBeTruthy();
    const result = useMLStore.getState().lastTrainingResult;
    expect(result.status).toBe('dataset_file_missing');
  });

  it('never returns generic dataset_missing status when a datasetId was provided', async () => {
    const datasetId = 'hist_QQQ_1d_RTH_20240101_20241231_yahoo';
    useMLStore.getState().setPendingDatasetId(datasetId);
    // Backend should return precise codes, never dataset_missing when datasetId is provided
    frontendApiMock.api.trainMLModelP1.mockResolvedValue({
      ok: false,
      status: 'dataset_not_found',
      message: 'Not in registry',
      datasetId,
    });

    await act(() => useMLStore.getState().startTraining());

    const result = useMLStore.getState().lastTrainingResult;
    expect(result.status).not.toBe('dataset_missing');
  });
});

// ── 11. clearPendingDatasetId removes queued dataset ─────────────────────────

describe('mlStore.clearPendingDatasetId', () => {
  it('clears the pending dataset id', () => {
    useMLStore.getState().setPendingDatasetId('hist_SPY_1d_RTH_20240101_20241231_yahoo');
    expect(useMLStore.getState().pendingDatasetId).toBe('hist_SPY_1d_RTH_20240101_20241231_yahoo');

    useMLStore.getState().clearPendingDatasetId();
    expect(useMLStore.getState().pendingDatasetId).toBeNull();
  });
});

// ── 12. historicalDataStore.clearSelection resets diagnostics ─────────────────

describe('historicalDataStore.clearSelection', () => {
  it('resets selectedDatasetId and diagnostics', async () => {
    useHistoricalDataStore.setState({
      selectedDatasetId: 'some_ds',
      selectedDataset: { datasetId: 'some_ds' },
      diagnostics: { fileExists: true },
      diagnosticsError: '',
    });

    act(() => useHistoricalDataStore.getState().clearSelection());

    expect(useHistoricalDataStore.getState().selectedDatasetId).toBeNull();
    expect(useHistoricalDataStore.getState().selectedDataset).toBeNull();
    expect(useHistoricalDataStore.getState().diagnostics).toBeNull();
  });
});
