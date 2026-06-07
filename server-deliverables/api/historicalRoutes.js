'use strict';

/**
 * historicalRoutes.js
 * Express router for the Historical Data Download Center API.
 *
 * Mount at: app.use('/api/historical', require('./historicalRoutes'))
 *
 * GET  /api/historical/providers           — list available providers
 * GET  /api/historical/datasets            — list all registered datasets
 * GET  /api/historical/datasets/:datasetId — get one dataset record
 * DELETE /api/historical/datasets/:datasetId — remove a dataset record
 * POST /api/historical/download            — trigger a download
 * GET  /api/historical/jobs/:jobId         — job status (synchronous; stub)
 */

const { Router } = require('express');
const router = Router();

const fs = require('fs');
const path = require('path');

const { downloadHistoricalData, getProviders } = require('../historical/historicalDataService');
const registry = require('../historical/historicalDatasetRegistry');
const { resolveDatasetFile } = require('../ai/trainingService');
const { jsonSafe } = require('./jsonSafety');

// Annotate a registry record with live file-existence info
function annotateDataset(ds) {
  const { issue } = resolveDatasetFile(ds);
  const fileExists = issue === null;
  return {
    ...ds,
    fileExists,
    status: fileExists ? (ds.status || 'ready') : 'file_missing',
  };
}

// ── Error code → HTTP status mapping ────────────────────────────────────────

const VALIDATION_CODES = new Set([
  'DEMO_NOT_ALLOWED',
  'INVALID_SYMBOLS',
  'symbol_required',
  'INVALID_TIMEFRAME',
  'INVALID_DATE_RANGE',
  'INVALID_SESSION',
  'INVALID_PURPOSE',
  'TOO_MANY_SYMBOLS',
  'DATE_RANGE_TOO_LARGE',
]);

const PROVIDER_ERROR_CODES = new Set([
  'PROVIDER_NOT_CONFIGURED',
  'PROVIDER_FETCH_FAILED',
  'RATE_LIMITED',
]);

function errorStatusFor(code) {
  if (VALIDATION_CODES.has(code))     return 400;
  if (PROVIDER_ERROR_CODES.has(code)) return 502;
  return 500;
}

// ── GET /providers ───────────────────────────────────────────────────────────

router.get('/providers', (_req, res) => {
  try {
    const providerList = getProviders();
    jsonSafe(res, 200, { ok: true, providers: providerList, defaultProvider: 'yahoo' });
  } catch (err) {
    jsonSafe(res, 500, { ok: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// ── GET /datasets ────────────────────────────────────────────────────────────

router.get('/datasets', (_req, res) => {
  try {
    const datasets = registry.list().map(annotateDataset);
    jsonSafe(res, 200, { ok: true, datasets });
  } catch (err) {
    jsonSafe(res, 500, { ok: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// ── GET /datasets/:datasetId ─────────────────────────────────────────────────

router.get('/datasets/:datasetId', (req, res) => {
  try {
    const { datasetId } = req.params;
    const dataset = registry.get(datasetId);
    if (!dataset) {
      return jsonSafe(res, 404, { ok: false, status: 'dataset_not_found', message: 'Historical dataset not found.', datasetId });
    }
    jsonSafe(res, 200, { ok: true, dataset: annotateDataset(dataset) });
  } catch (err) {
    jsonSafe(res, 500, { ok: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// ── GET /datasets/:datasetId/diagnostics ─────────────────────────────────────

router.get('/datasets/:datasetId/diagnostics', (req, res) => {
  try {
    const { datasetId } = req.params;
    const dataset = registry.get(datasetId);

    if (!dataset) {
      const all = registry.list();
      return res.status(404).json({
        ok: true,
        datasetId,
        registryFound: false,
        fileExists: false,
        usableForMl: false,
        issues: ['dataset_not_found'],
        availableDatasetIds: all.map((d) => d.datasetId).filter(Boolean),
      });
    }

    const { resolvedPath, candidatePaths, issue } = resolveDatasetFile(dataset);
    const fileExists = issue === null;
    let fileSizeBytes = null;

    if (fileExists && resolvedPath) {
      try { fileSizeBytes = fs.statSync(resolvedPath).size; } catch {}
    }

    jsonSafe(res, 200, {
      ok: true,
      datasetId,
      registryFound: true,
      dataset,
      candidatePaths,
      resolvedPaths: resolvedPath ? [resolvedPath] : [],
      fileExists,
      fileSizeBytes,
      usableForMl: fileExists,
      issues: issue ? [issue] : [],
    });
  } catch (err) {
    jsonSafe(res, 500, { ok: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// ── DELETE /datasets/:datasetId ──────────────────────────────────────────────

router.delete('/datasets/:datasetId', (req, res) => {
  try {
    const { datasetId } = req.params;
    const existed = registry.remove(datasetId);
    if (!existed?.deleted) {
      return jsonSafe(res, 404, { ok: false, status: 'dataset_not_found', message: 'Historical dataset not found.', datasetId });
    }
    jsonSafe(res, 200, { ok: true, deleted: true, datasetId });
  } catch (err) {
    jsonSafe(res, 500, { ok: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// ── POST /download ───────────────────────────────────────────────────────────

router.post('/download', async (req, res) => {
  try {
    const result = await downloadHistoricalData(req.body || {});

    if (result.ok) {
      return jsonSafe(res, 200, result);
    }

    const code       = result.error?.code || result.status || 'UNKNOWN_ERROR';
    const statusCode = errorStatusFor(code);
    return jsonSafe(res, statusCode, result);
  } catch (err) {
    jsonSafe(res, 500, { ok: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});


function resolveUseDataset(req, res, purpose) {
  const datasetId = req.body?.datasetId || req.body?.id;
  if (!datasetId) {
    return jsonSafe(res, 400, { ok: false, status: 'dataset_missing', message: 'datasetId is required.', purpose });
  }
  const dataset = registry.get(datasetId);
  if (!dataset) {
    return jsonSafe(res, 404, { ok: false, status: 'dataset_not_found', message: 'Historical dataset not found.', datasetId, purpose });
  }
  const annotated = annotateDataset(dataset);
  if (!annotated.fileExists) {
    return jsonSafe(res, 409, { ok: false, status: 'dataset_file_missing', message: 'Historical dataset file is missing.', datasetId, purpose, dataset: annotated });
  }
  return jsonSafe(res, 200, { ok: true, status: 'selected', purpose, datasetId, dataset: annotated });
}

router.post('/use-for-ml', (req, res) => resolveUseDataset(req, res, 'ml'));
router.post('/use-for-backtest', (req, res) => resolveUseDataset(req, res, 'backtest'));
router.post('/use-for-correlation', (req, res) => resolveUseDataset(req, res, 'correlation'));

// ── GET /jobs/:jobId ─────────────────────────────────────────────────────────

router.get('/jobs/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    // First version is fully synchronous — no async job tracking needed.
    // Return a stub response so clients get a valid 200 rather than 404.
    jsonSafe(res, 200, {
      ok:      true,
      jobId,
      status:  'completed',
      message: 'Synchronous download — no async job tracking.',
    });
  } catch (err) {
    jsonSafe(res, 500, { ok: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

module.exports = router;
