import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { normalizeDatasetId, datasetPayload, normalizeSymbol, buildSymbolsPayload } from '../../src/utils/payload.js';
import { attachNetworkGuards } from './helpers/networkGuards';
import { bootApp } from './helpers/appHarness';

const datasets = [
  { name: 'datasetId', value: { datasetId: 'ds-123', fileStatus: 'ready' } },
  { name: 'id-only', value: { id: 'ds-456', status: 'ready' } },
  { name: 'missing-id', value: { status: 'ready' } },
  { name: 'old-registry', value: { metadata: { dataset_id: 'ds-789' }, file_status: 'ready' } },
  { name: 'empty-file-status', value: { datasetId: 'ds-empty', fileStatus: '' } },
  { name: 'missing-file-status', value: { datasetId: 'ds-missing-status' } },
];
const symbols: any[] = ['SPY', 'spy', ' SPY ', 'SPY,QQQ', '', null, undefined];
const actions = ['Use for ML', 'Use for Backtesting', 'Use for Correlation', 'Train Model', 'Run Backtest', 'Run Correlation', 'Run Beta', 'Promote Model', 'Run Inference'];

test('payload fuzzing normalizes dataset IDs and blocks undefined payloads before API use', async ({ page }) => {
  const guard = attachNetworkGuards(page);
  await bootApp(page);
  const results: any[] = [];

  for (const dataset of datasets) {
    const normalizedId = normalizeDatasetId(dataset.value);
    const payload = datasetPayload(dataset.value, { target: 'ml' });
    results.push({ type: 'dataset', name: dataset.name, normalizedId, payload });
    if (['missing-id'].includes(dataset.name)) {
      expect(normalizedId).toBe('');
      expect(payload.ok).toBe(false);
    } else {
      expect(normalizedId).not.toMatch(/undefined|null|NaN/);
      expect(JSON.stringify(payload)).not.toContain('undefined');
    }
  }

  for (const symbol of symbols) {
    const normalized = normalizeSymbol(symbol);
    const payload = buildSymbolsPayload(symbol);
    results.push({ type: 'symbol', source: String(symbol), normalized, payload });
    if (symbol == null || String(symbol).trim() === '') {
      expect(normalized).toBe('');
      expect(payload.ok).toBe(false);
    } else {
      expect(JSON.stringify(payload)).not.toContain('undefined');
      expect(payload.ok).toBe(true);
      expect(payload.symbols.length).toBeGreaterThan(0);
    }
  }

  for (const action of actions) {
    results.push({ type: 'action', action, validDataset: normalizeDatasetId({ datasetId: 'ds-123' }), invalidDataset: normalizeDatasetId({}) });
  }

  fs.writeFileSync('PAYLOAD_FUZZ_RESULTS.json', JSON.stringify({ generatedAt: new Date().toISOString(), results, apiRequests: guard.apiRequests }, null, 2));
  guard.assertClean();
});
