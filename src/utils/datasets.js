export function getDatasetId(dataset) {
  return dataset?.datasetId || dataset?.id || null;
}

export function assertDatasetId(dataset) {
  const datasetId = getDatasetId(dataset);
  if (!datasetId) {
    return { ok: false, error: 'Dataset ID missing. Reload dataset registry.' };
  }
  return { ok: true, datasetId };
}

export function normalizeDataset(dataset) {
  if (!dataset || typeof dataset !== 'object') return dataset;
  const datasetId = getDatasetId(dataset);
  return {
    ...dataset,
    datasetId,
    id: dataset.id || datasetId,
    symbols: Array.isArray(dataset.symbols) ? dataset.symbols : [],
    rowCount: Number.isFinite(Number(dataset.rowCount)) ? Number(dataset.rowCount) : 0,
    rowsBySymbol: dataset.rowsBySymbol || {},
    files: dataset.files || {},
    warnings: Array.isArray(dataset.warnings) ? dataset.warnings : [],
  };
}
