/**
 * Resolves whether a data-dependent module has sufficient data to operate.
 *
 * Each canonical module calls this before rendering content so it can show
 * a precise, actionable status rather than a blank screen or generic "No data".
 *
 * Returns one of:
 *   ready                     - dataset exists, file exists, symbols present, enough rows
 *   dataset_required          - no datasetId provided; module needs one to calculate
 *   dataset_not_found         - datasetId provided but not in registry
 *   dataset_file_missing      - dataset record exists but CSV file is absent
 *   dataset_file_empty        - file exists but has 0 data rows
 *   missing_symbols           - dataset does not contain all requested symbols
 *   missing_columns           - dataset CSV is missing required columns
 *   not_enough_data           - dataset has data but fewer rows than minimumRows for the window
 *   provider_required         - live-data module needs an active provider
 *   provider_credentials_required - provider is selected but credentials are missing
 *   auto_create_available     - missing dataset can be auto-created; autoCreate=true was requested
 *   auto_create_failed        - auto-create was attempted but failed
 *
 * Credentials are NEVER stored on the frontend. This service never reads API keys.
 */

import { api } from '../api.js';
import { useHistoricalDataStore } from '../store/historicalDataStore.js';
import { getDatasetId } from '../utils/datasets.js';

export function normalizeRequirementSymbols(symbols = []) {
  return [...new Set((symbols || []).map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))];
}

function datasetHasSymbol(dataset, symbol) {
  return (dataset?.symbols || []).map((s) => String(s).toUpperCase()).includes(symbol);
}

function datasetRowsForSymbol(dataset, symbol) {
  const rowsBySymbol = dataset?.rowsBySymbol || {};
  return Number(rowsBySymbol[symbol] ?? dataset?.rowCount ?? 0);
}

function datesOverlap(a, b) {
  if (!a || !b || !a.startDate || !a.endDate || !b.startDate || !b.endDate) return true;
  return String(a.startDate) <= String(b.endDate) && String(b.startDate) <= String(a.endDate);
}

function datasetCompatible(a, b, timeframe) {
  if (!a || !b) return false;
  if (timeframe && a.timeframe && a.timeframe !== timeframe) return false;
  if (timeframe && b.timeframe && b.timeframe !== timeframe) return false;
  if (a.provider && b.provider && a.provider !== b.provider) return false;
  if (a.session && b.session && a.session !== b.session) return false;
  return datesOverlap(a, b);
}

export function resolveCompatibleDatasetsFromRegistry({ symbols = [], timeframe = '1d', minimumRows = 2, selectedDatasetId = null, datasets = [] } = {}) {
  const normalizedSymbols = normalizeRequirementSymbols(symbols);
  const readyDatasets = (datasets || []).filter((dataset) => getDatasetId(dataset));
  const selected = readyDatasets.find((dataset) => getDatasetId(dataset) === selectedDatasetId) || null;
  const datasetsBySymbol = {};
  const datasetRecordsBySymbol = {};

  for (const symbol of normalizedSymbols) {
    const candidates = readyDatasets.filter((dataset) => {
      if (!datasetHasSymbol(dataset, symbol)) return false;
      if (timeframe && dataset.timeframe && dataset.timeframe !== timeframe) return false;
      if (minimumRows > 1 && datasetRowsForSymbol(dataset, symbol) < minimumRows) return false;
      return true;
    });
    const preferred = candidates.find((dataset) => getDatasetId(dataset) === selectedDatasetId) || candidates[0] || null;
    if (preferred) {
      datasetsBySymbol[symbol] = getDatasetId(preferred);
      datasetRecordsBySymbol[symbol] = preferred;
    }
  }

  const missingSymbols = normalizedSymbols.filter((symbol) => !datasetsBySymbol[symbol]);
  if (missingSymbols.length > 0) return { ok: false, missingSymbols, datasetsBySymbol, datasetRecordsBySymbol };

  const records = Object.values(datasetRecordsBySymbol);
  const anchor = selected && records.some((dataset) => getDatasetId(dataset) === getDatasetId(selected)) ? selected : records[0];
  const incompatible = records.filter((dataset) => !datasetCompatible(anchor, dataset, timeframe));
  if (incompatible.length > 0) return { ok: false, incompatibleDatasets: incompatible.map(getDatasetId), datasetsBySymbol, datasetRecordsBySymbol };

  const datasetIds = normalizedSymbols.map((symbol) => datasetsBySymbol[symbol]);
  const uniqueIds = [...new Set(datasetIds)];
  return { ok: true, symbols: normalizedSymbols, datasetIds, datasetsBySymbol, datasetRecordsBySymbol, resolution: uniqueIds.length > 1 ? 'multi_dataset' : 'single_dataset' };
}

/**
 * @param {object} opts
 * @param {string}   opts.moduleId            - workspace ID calling the resolver
 * @param {string}   opts.purpose             - 'correlation' | 'beta' | 'ml' | 'backtest' | 'portfolio' | 'risk'
 * @param {string[]} opts.symbols             - required symbols, e.g. ['SPY','NFLX']
 * @param {string}   [opts.timeframe]         - '1d' | '1m' etc.
 * @param {string}   [opts.selectedDatasetId] - dataset to validate
 * @param {boolean}  [opts.autoCreate]        - if true, offer auto-create flow for missing dataset
 * @param {string[]} [opts.requiredColumns]   - columns that must be present (optional)
 * @param {number}   [opts.minimumRows]       - minimum rows per symbol required
 * @returns {Promise<DataRequirementResult>}
 */
export async function resolveDataRequirement({
  moduleId,
  purpose,
  symbols = [],
  timeframe = '1d',
  selectedDatasetId = null,
  autoCreate = false,
  requiredColumns = [],
  minimumRows = 2,
} = {}) {
  // Validate inputs — never silently proceed with undefined
  if (!moduleId) throw new Error('resolveDataRequirement: moduleId is required');
  if (!purpose)  throw new Error('resolveDataRequirement: purpose is required');
  if (symbols.some((s) => !s || typeof s !== 'string')) {
    throw new Error('resolveDataRequirement: symbols must be an array of non-empty strings');
  }

  const normalizedSymbols = normalizeRequirementSymbols(symbols);
  const availableDatasets = useHistoricalDataStore.getState().datasets || [];
  if (normalizedSymbols.length) {
    const compatible = resolveCompatibleDatasetsFromRegistry({ symbols: normalizedSymbols, timeframe, minimumRows, selectedDatasetId, datasets: availableDatasets });
    if (compatible.ok) {
      return {
        status: compatible.resolution === 'multi_dataset' ? 'ready_multi_dataset' : 'ready',
        moduleId,
        purpose,
        symbols: compatible.symbols,
        timeframe,
        datasetId: compatible.datasetIds[0] || null,
        datasetIds: compatible.datasetIds,
        datasetsBySymbol: compatible.datasetsBySymbol,
        resolution: compatible.resolution,
        message: compatible.resolution === 'multi_dataset' ? `Using compatible datasets: ${compatible.symbols.join(', ')}` : 'Dataset ready.',
      };
    }
  }

  if (!selectedDatasetId) {
    if (autoCreate && symbols.length >= 2) {
      return {
        status: 'auto_create_available',
        moduleId,
        purpose,
        symbols: normalizedSymbols,
        timeframe,
        message: `No dataset selected. Create a dataset for ${symbols.join(', ')} to enable ${purpose}.`,
        action: { type: 'create_dataset', symbols, timeframe },
      };
    }
    return {
      status: 'dataset_required',
      moduleId,
      purpose,
      symbols: normalizedSymbols,
      message: `Select a historical dataset that contains ${symbols.join(', ')} to enable ${purpose}.`,
      action: { type: 'select_dataset' },
    };
  }

  let diagnostics;
  try {
    diagnostics = await api.getHistoricalDatasetDiagnostics(selectedDatasetId);
  } catch (err) {
    return {
      status: 'dataset_not_found',
      moduleId,
      purpose,
      datasetId: selectedDatasetId,
      message: `Dataset "${selectedDatasetId}" not found. Select a different dataset.`,
    };
  }

  if (!diagnostics?.registryFound) {
    return {
      status: 'dataset_not_found',
      moduleId,
      purpose,
      datasetId: selectedDatasetId,
      message: `Dataset "${selectedDatasetId}" is not in the registry. It may have been deleted.`,
    };
  }

  if (!diagnostics?.fileExists) {
    return {
      status: 'dataset_file_missing',
      moduleId,
      purpose,
      datasetId: selectedDatasetId,
      message: `Dataset file for "${selectedDatasetId}" is missing. Re-download or select a different dataset.`,
    };
  }

  // Symbol coverage check (requires enhanced diagnostics from Phase 6 backend endpoint)
  const availableSymbols = diagnostics?.symbols || [];
  if (symbols.length > 0 && availableSymbols.length > 0) {
    const missing = symbols.filter((s) => !availableSymbols.includes(s));
    if (missing.length > 0) {
      if (autoCreate) {
        return {
          status: 'auto_create_available',
          moduleId,
          purpose,
          datasetId: selectedDatasetId,
          symbols: normalizedSymbols,
          availableSymbols,
          missingSymbols: missing,
          message: `Dataset "${selectedDatasetId}" is missing: ${missing.join(', ')}. Create a new dataset with all required symbols.`,
          action: { type: 'create_dataset', symbols, timeframe },
        };
      }
      return {
        status: 'missing_symbols',
        moduleId,
        purpose,
        datasetId: selectedDatasetId,
        symbols: normalizedSymbols,
        availableSymbols,
        missingSymbols: missing,
        message: `Dataset "${selectedDatasetId}" does not contain: ${missing.join(', ')}. Available: ${availableSymbols.join(', ') || '(none)'}.`,
        action: { type: 'select_dataset' },
      };
    }
  }

  // Row count check (requires rowsBySymbol from enhanced diagnostics)
  const rowsBySymbol = diagnostics?.rowsBySymbol || {};
  if (minimumRows > 1 && symbols.length > 0 && Object.keys(rowsBySymbol).length > 0) {
    const symbolsWithTooFewRows = symbols.filter((s) => {
      const rows = rowsBySymbol[s];
      return rows !== undefined && rows < minimumRows;
    });
    if (symbolsWithTooFewRows.length > 0) {
      return {
        status: 'not_enough_data',
        moduleId,
        purpose,
        datasetId: selectedDatasetId,
        symbols: normalizedSymbols,
        rowsBySymbol,
        minimumRows,
        message: `Dataset "${selectedDatasetId}" does not have enough rows for ${purpose} (need ${minimumRows} per symbol). Symbols with insufficient data: ${symbolsWithTooFewRows.join(', ')}.`,
      };
    }
  }

  // Column check
  if (requiredColumns.length > 0) {
    const datasetColumns = diagnostics?.columns || [];
    if (datasetColumns.length > 0) {
      const missingCols = requiredColumns.filter((c) => !datasetColumns.includes(c));
      if (missingCols.length > 0) {
        return {
          status: 'missing_columns',
          moduleId,
          purpose,
          datasetId: selectedDatasetId,
          missingColumns: missingCols,
          availableColumns: datasetColumns,
          message: `Dataset "${selectedDatasetId}" is missing required columns: ${missingCols.join(', ')}.`,
        };
      }
    }
  }

  return {
    status: 'ready',
    moduleId,
    purpose,
    datasetId: selectedDatasetId,
    symbols: normalizedSymbols,
    availableSymbols,
    rowsBySymbol,
    dataset: diagnostics?.dataset || null,
  };
}

/**
 * Attempts to auto-create a multi-symbol dataset via backend historical download.
 * Never fakes success — returns the actual backend response.
 *
 * @param {object} opts
 * @param {string[]} opts.symbols
 * @param {string}   opts.timeframe
 * @param {string}   [opts.provider]     - defaults to 'yahoo'
 * @param {string}   [opts.startDate]
 * @param {string}   [opts.endDate]
 * @returns {Promise<{ok, datasetId?, error?}>}
 */
export async function autoCreateDataset({ symbols, timeframe = '1d', provider = 'yahoo', startDate, endDate } = {}) {
  if (!symbols?.length || symbols.length < 2) {
    return { ok: false, error: 'At least 2 symbols required for multi-asset dataset creation.' };
  }
  try {
    const result = await api.downloadHistoricalData({
      symbols,
      timeframe,
      provider,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
    return result;
  } catch (err) {
    return { ok: false, error: err?.message || 'Dataset creation failed.' };
  }
}
