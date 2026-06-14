'use strict';

/**
 * historicalDatasetRegistry.js
 * File-backed registry for historical dataset records.
 *
 * Storage layout:
 *   data/historical/              ← DATA_DIR
 *     datasets.json               ← REGISTRY_FILE (array of records)
 *     <datasetId>.csv             ← CSV export (optional)
 *     <datasetId>.json            ← JSON export (optional)
 */

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const DATA_DIR      = process.env.HISTORICAL_DATA_DIR || path.join(process.cwd(), 'data', 'historical');
const REGISTRY_FILE = path.join(DATA_DIR, 'datasets.json');

// Security: dataset IDs must match this pattern to prevent path traversal.
const DATASET_ID_RE = /^[a-zA-Z0-9_-]{1,200}$/;

// ---------------------------------------------------------------------------
// Directory bootstrapping
// ---------------------------------------------------------------------------

/**
 * Ensure DATA_DIR (and any required subdirectories) exist.
 * Called lazily before the first registry access.
 */
function _ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Internal JSON persistence
// ---------------------------------------------------------------------------

/**
 * Load the registry from disk.
 * Returns an empty array if the file does not exist or is corrupt.
 * @returns {Object[]}
 */
function _load() {
  _ensureDir();
  if (!fs.existsSync(REGISTRY_FILE)) return [];
  try {
    const raw = fs.readFileSync(REGISTRY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

/**
 * Persist the datasets array to disk atomically (write to temp then rename).
 * @param {Object[]} datasets
 */
function _save(datasets) {
  _ensureDir();
  const tmp = REGISTRY_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(datasets, null, 2), 'utf8');
  fs.renameSync(tmp, REGISTRY_FILE);
}

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

/**
 * safePath — returns an absolute path under DATA_DIR for the given filename.
 * Throws if the resolved path would escape DATA_DIR (path traversal guard).
 *
 * @param {string} subdir    Subdirectory relative to DATA_DIR (may be '').
 * @param {string} filename  File name (not a path).
 * @returns {string} Absolute path.
 */
function safePath(subdir, filename) {
  const base    = subdir ? path.join(DATA_DIR, subdir) : DATA_DIR;
  const resolved = path.resolve(base, filename);
  if (!resolved.startsWith(DATA_DIR + path.sep) && resolved !== DATA_DIR) {
    throw new Error(`Path traversal detected: "${filename}" resolves outside DATA_DIR.`);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Dataset ID generation
// ---------------------------------------------------------------------------

/**
 * generateDatasetId — builds a deterministic, human-readable dataset ID from
 * the download parameters.
 *
 * Format: hist_<SYMBOLS>_<TIMEFRAME>_<SESSION>_<START>_<END>_<PROVIDER>
 * Example: hist_SPY_QQQ_5m_RTH_20240101_20241231_yahoo
 *
 * @param {{ symbols: string[], timeframe: string, startDate: string,
 *            endDate: string, session: string, provider: string }} params
 * @returns {string}
 */
function generateDatasetId({ symbols, timeframe, startDate, endDate, session, provider }) {
  const syms    = [...symbols].map(s => s.toUpperCase()).sort().join('_');
  const start   = (startDate || '').replace(/-/g, '');
  const end     = (endDate   || '').replace(/-/g, '');
  const sess    = (session   || 'ALL').toUpperCase();
  const prov    = (provider  || 'unknown').toLowerCase();
  const tf      = (timeframe || 'unknown').toLowerCase();
  return `hist_${syms}_${tf}_${sess}_${start}_${end}_${prov}`;
}

// ---------------------------------------------------------------------------
// Registry CRUD
// ---------------------------------------------------------------------------

/**
 * list — returns all dataset records sorted by createdAt descending.
 * @returns {Object[]}
 */
function normalizeDataset(dataset) {
  if (!dataset || typeof dataset !== 'object') return null;
  const datasetId = dataset.datasetId || dataset.id;
  if (!datasetId) return null;
  const files = dataset.files && typeof dataset.files === 'object' ? dataset.files : {};
  return {
    ...dataset,
    datasetId,
    id: dataset.id || datasetId,
    symbols: Array.isArray(dataset.symbols) ? dataset.symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean) : [],
    rowCount: Number.isFinite(Number(dataset.rowCount)) ? Number(dataset.rowCount) : 0,
    rowsBySymbol: dataset.rowsBySymbol && typeof dataset.rowsBySymbol === 'object' ? dataset.rowsBySymbol : {},
    files: { csv: files.csv || null, parquet: files.parquet || null, json: files.json || null },
    schema: dataset.schema || 'HistoricalCandle.v1',
    warnings: Array.isArray(dataset.warnings) ? dataset.warnings : [],
  };
}

function list() {
  const datasets = _load().map(normalizeDataset).filter(Boolean);
  return datasets.slice().sort((a, b) => {
    const ta = a.createdAt || '';
    const tb = b.createdAt || '';
    return tb.localeCompare(ta);
  });
}

/**
 * get — retrieves a single dataset record by id.
 * Returns null if not found or if the id fails the security check.
 *
 * @param {string} datasetId
 * @returns {Object|null}
 */
function get(datasetId) {
  if (!datasetId || !DATASET_ID_RE.test(datasetId)) return null;
  const datasets = _load();
  return datasets.map(normalizeDataset).filter(Boolean).find(d => d.datasetId === datasetId || d.id === datasetId) || null;
}

/**
 * register — upsert a dataset record into the registry.
 * If a record with the same datasetId already exists it is replaced.
 *
 * @param {Object} record  Must include .datasetId
 * @returns {Object} The saved record (with updatedAt stamped).
 */
function register(record) {
  const normalizedRecord = normalizeDataset(record);
  if (!normalizedRecord || !normalizedRecord.datasetId) {
    throw new Error('record.datasetId is required');
  }
  if (!DATASET_ID_RE.test(normalizedRecord.datasetId)) {
    throw new Error(`Invalid datasetId: "${normalizedRecord.datasetId}"`);
  }

  const datasets   = _load().map(normalizeDataset).filter(Boolean);
  const now        = new Date().toISOString();
  const saved      = { ...normalizedRecord, updatedAt: now };
  if (!saved.createdAt) saved.createdAt = now;

  const idx = datasets.findIndex(d => d.datasetId === normalizedRecord.datasetId || d.id === normalizedRecord.datasetId);
  if (idx >= 0) {
    datasets[idx] = saved;
  } else {
    datasets.push(saved);
  }

  _save(datasets);
  return saved;
}

/**
 * remove — deletes a dataset record and any associated CSV/JSON files.
 *
 * @param {string} datasetId
 * @returns {{ ok: boolean, deleted: boolean, filesRemoved: string[] }}
 */
function remove(datasetId) {
  if (!datasetId || !DATASET_ID_RE.test(datasetId)) {
    return { ok: false, deleted: false, filesRemoved: [], error: 'Invalid datasetId' };
  }

  const datasets = _load();
  const idx      = datasets.map(normalizeDataset).findIndex(d => d && (d.datasetId === datasetId || d.id === datasetId));

  if (idx < 0) {
    return { ok: true, deleted: false, filesRemoved: [] };
  }

  datasets.splice(idx, 1);
  _save(datasets);

  // Remove associated files (CSV + JSON exports)
  const filesRemoved = [];
  for (const ext of ['csv', 'json']) {
    try {
      const filePath = safePath('', `${datasetId}.${ext}`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        filesRemoved.push(filePath);
      }
    } catch (_err) {
      // Ignore individual file deletion errors
    }
  }

  return { ok: true, deleted: true, filesRemoved };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  DATA_DIR,
  REGISTRY_FILE,
  DATASET_ID_RE,
  generateDatasetId,
  normalizeDataset,
  list,
  listDatasets: list,
  get,
  getDataset: get,
  register,
  saveDataset: register,
  remove,
  safePath,
  _load,
  _save,
};
