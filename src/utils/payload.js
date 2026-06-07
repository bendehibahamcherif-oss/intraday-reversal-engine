export function stripUndefinedDeep(value) {
  if (Array.isArray(value)) return value.map(stripUndefinedDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, stripUndefinedDeep(item)]),
    );
  }
  return value;
}

export function assertNoUndefinedDeep(value, path = 'payload') {
  if (value === undefined) throw new Error(`${path} contains undefined`);
  if (Array.isArray(value)) value.forEach((item, index) => assertNoUndefinedDeep(item, `${path}[${index}]`));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => assertNoUndefinedDeep(item, `${path}.${key}`));
}

export function normalizeDatasetId(datasetOrId) {
  if (datasetOrId == null) return '';
  if (typeof datasetOrId === 'string' || typeof datasetOrId === 'number') {
    const value = String(datasetOrId).trim();
    return value && value !== 'undefined' && value !== 'null' && value !== 'NaN' ? value : '';
  }
  if (typeof datasetOrId !== 'object') return '';
  const candidates = [
    datasetOrId.datasetId,
    datasetOrId.dataset_id,
    datasetOrId.id,
    datasetOrId?.metadata?.datasetId,
    datasetOrId?.metadata?.dataset_id,
    datasetOrId?.file?.datasetId,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeDatasetId(candidate);
    if (normalized) return normalized;
  }
  return '';
}

export function datasetPayload(datasetOrId, extra = {}) {
  const datasetId = normalizeDatasetId(datasetOrId);
  if (!datasetId) return { ok: false, error: 'Dataset ID missing. Select a valid historical dataset before continuing.' };
  return { ok: true, ...stripUndefinedDeep({ ...extra, datasetId }) };
}

export function normalizeSymbol(symbol) {
  if (symbol == null) return '';
  const value = String(symbol).trim().toUpperCase();
  if (!value || value === 'UNDEFINED' || value === 'NULL' || value === 'NAN') return '';
  return value;
}

export function buildSymbolsPayload(input) {
  const raw = Array.isArray(input) ? input : String(input ?? '').split(',');
  const symbols = [...new Set(raw.map(normalizeSymbol).filter(Boolean))];
  if (symbols.length === 0) return { ok: false, error: 'At least one valid symbol is required.' };
  return { ok: true, symbol: symbols[0], symbols };
}
