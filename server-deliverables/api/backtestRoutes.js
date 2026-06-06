'use strict';

const { Router } = require('express');
const fs = require('fs');
const registry = require('../historical/historicalDatasetRegistry');
const { sanitizeJson } = require('./jsonSafety');

const router = Router();

function datasetError(datasetId, status) {
  if (status === 'dataset_not_found') return { ok: false, status, message: 'Historical dataset not found.', datasetId };
  return { ok: false, status: 'dataset_file_missing', message: 'Historical dataset exists but no usable CSV/Parquet file was found.', datasetId };
}

function resolveDataset(datasetId) {
  if (!datasetId) return { ok: true, dataset: null, filePath: null };
  const dataset = registry.get(String(datasetId));
  if (!dataset) return datasetError(datasetId, 'dataset_not_found');
  const filePath = (dataset.files?.csv && fs.existsSync(dataset.files.csv))
    ? dataset.files.csv
    : ((dataset.files?.parquet && fs.existsSync(dataset.files.parquet)) ? dataset.files.parquet : null);
  if (!filePath) return datasetError(dataset.datasetId || datasetId, 'dataset_file_missing');
  return { ok: true, dataset, filePath };
}

router.post(['/run', '/run/:symbol'], (req, res) => {
  const body = req.body || {};
  const symbol = String(req.params.symbol || body.symbol || 'SPY').trim().toUpperCase();
  const datasetId = body.datasetId ? String(body.datasetId).trim() : '';
  const resolved = resolveDataset(datasetId);
  if (!resolved.ok) return res.status(resolved.status === 'dataset_not_found' ? 404 : 400).json(sanitizeJson(resolved));

  if (!resolved.dataset) {
    return res.status(400).json({ ok: false, status: 'dataset_missing', message: 'Select a historical dataset before running this backtest.' });
  }

  const dataset = resolved.dataset;
  const rowCount = Number.isFinite(Number(dataset.rowCount)) ? Number(dataset.rowCount) : 0;
  if (rowCount < 2) {
    return res.json(sanitizeJson({
      ok: false,
      status: 'not_enough_data',
      message: 'Not enough historical rows to run backtest.',
      datasetId: dataset.datasetId,
      dataSource: { type: 'historical_dataset', datasetId: dataset.datasetId, provider: dataset.provider, rowCount },
    }));
  }

  return res.json(sanitizeJson({
    ok: true,
    status: 'not_enough_data',
    message: 'Historical dataset resolved; strategy execution engine requires a concrete strategy implementation.',
    id: `bt_${Date.now()}`,
    symbol,
    timeframe: body.timeframe || dataset.timeframe,
    strategyId: body.strategyId || body.strategy?.type || 'default_or_existing',
    dataSource: { type: 'historical_dataset', datasetId: dataset.datasetId, provider: dataset.provider, rowCount },
    trades: [],
    metrics: {},
  }));
});

router.get('/results/:symbol', (req, res) => res.json({ ok: true, results: [] }));
router.get('/results/:symbol/:id', (req, res) => res.status(404).json({ ok: false, status: 'result_not_found', message: 'Backtest result not found.' }));
router.delete('/results/:symbol', (req, res) => res.json({ ok: true, deleted: true }));
router.post('/walk-forward/:symbol', (req, res) => res.json({ ok: false, status: 'not_enough_data', message: 'Not enough data.' }));
router.post('/monte-carlo/:symbol', (req, res) => res.json({ ok: false, status: 'not_enough_data', message: 'Not enough data.' }));

module.exports = router;
