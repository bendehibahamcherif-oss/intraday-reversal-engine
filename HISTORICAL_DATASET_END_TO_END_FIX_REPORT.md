# Historical Dataset End-to-End Fix Report

## 1. Executive summary
Fixed the historical dataset contract from download through registry, detail rendering, ML training, backtesting, and correlation/beta analytics. The canonical object now carries both `datasetId` and `id`, symbols are normalized end-to-end, selected datasets are propagated through shared helpers, API payloads are stripped of undefined values, and backend JSON responses sanitize invalid numbers.

## 2. Root cause of `symbol_required`
The request contract was split between `symbols` and legacy `symbol`. The backend did not enforce a single canonical normalization pipeline with trimming, uppercasing, empty removal, and deduplication before validation. The download service now accepts both forms and rejects only when the normalized array is empty.

## 3. Root cause of `Dataset "undefined"`
Historical Data action buttons used `dataset.datasetId` directly. Existing or partial records with only `id` produced `undefined` in the event payload and notification. A shared frontend helper now resolves `dataset.datasetId || dataset.id || null`.

## 4. Root cause of `dataset_missing` after Use for ML
AILab did not listen for the Historical Data selection event and did not include the selected historical `datasetId` in `POST /api/ml/train`. AILab now stores `selectedMlDatasetId` and includes it in the train payload.

## 5. Root cause of NaN in beta/correlation
Correlation and beta paths could compute on insufficient or unaligned observations and return raw invalid numbers. Dataset-backed analytics now align returns by timestamp, require overlapping observations, use `null` for uncomputable beta/r2/correlation values, and sanitize JSON.

## 6. Backend dataset object before/after
Before: registry records could be raw and incomplete, e.g. `{ id, files }` or `{ datasetId, symbols }`.

After:

```json
{
  "datasetId": "hist_NFLX_1d_RTH_20210607_20260605_yahoo",
  "id": "hist_NFLX_1d_RTH_20210607_20260605_yahoo",
  "provider": "yahoo",
  "symbols": ["NFLX"],
  "timeframe": "1d",
  "startDate": "2021-06-07",
  "endDate": "2026-06-05",
  "session": "RTH",
  "purpose": "general",
  "rowCount": 1234,
  "rowsBySymbol": { "NFLX": 1234 },
  "files": { "csv": "...", "parquet": null, "json": null },
  "schema": "HistoricalCandle.v1",
  "status": "ready",
  "warnings": []
}
```

## 7. Frontend dataset object before/after
Before: UI assumed `dataset.datasetId` existed and rendered only summary fields.

After: UI normalizes selected datasets, displays a labeled Dataset ID, symbols, timeframe, date range, provider, session, purpose, row count, status, CSV file, rows by symbol, and warnings.

## 8. ML payload before/after
Before:

```json
{ "symbol": "SPY", "horizon": 10, "modelType": "xgboost" }
```

After:

```json
{ "symbol": "SPY", "horizon": 10, "datasetId": "hist_NFLX_1d_RTH_20210607_20260605_yahoo", "modelType": "xgboost" }
```

## 9. Backtest payload before/after
Before:

```json
{ "strategyId": "...", "timeframe": "1d", "datasetId": "maybe-present" }
```

After:

```json
{
  "datasetId": "hist_NFLX_1d_RTH_20210607_20260605_yahoo",
  "symbol": "NFLX",
  "timeframe": "1d",
  "strategyId": "..."
}
```

The backend response now includes `dataSource.datasetId` when a dataset is used.

## 10. Correlation payload before/after
Before: correlation could include `datasetId`; beta could not.

After:

```http
GET /api/multi-asset/correlation?datasetId=hist_NFLX_1d_RTH_20210607_20260605_yahoo&symbols=NFLX,SPY&window=20
GET /api/multi-asset/beta?datasetId=hist_NFLX_1d_RTH_20210607_20260605_yahoo&symbol=NFLX&benchmark=SPY&window=20
```

## 11. Backend files changed
- `server-deliverables/historical/historicalDatasetRegistry.js`
- `server-deliverables/historical/historicalDataService.js`
- `server-deliverables/api/historicalRoutes.js`
- `server-deliverables/api/jsonSafety.js`
- `server-deliverables/ai/trainingService.js`
- `server-deliverables/ai/mlRoutes.js`
- `server-deliverables/api/backtestRoutes.js`
- `server-deliverables/api/multiAssetRoutes.js`
- `server/index.cjs`

## 12. Frontend files changed
- `src/utils/datasets.js`
- `src/utils/payload.js`
- `src/api.js`
- `src/store/historicalDataStore.js`
- `src/store/aiLabStore.js`
- `src/store/mlStore.js`
- `src/store/quantLabStore.js`
- `src/store/macroStore.js`
- `src/workspaces/HistoricalDataWorkspace.jsx`
- `src/workspaces/AILabWorkspace.jsx`
- `src/workspaces/QuantLabWorkspace.jsx`
- `src/workspaces/MacroWorkspace.jsx`
- `src/services/wsClient.js`
- `src/test/setup.js`

## 13. Tests added
- `src/test/historicalDatasetContractEndToEnd.test.js`
- `src/test/datasetFrontendContract.test.jsx`
- `src/test/apiPayloadContract.test.js`
- Updated `src/test/historicalDataCenter.test.js` for canonical dataset normalization.

## 14. Validation results
- `npm test`: passed, 128 tests.
- `npm run build`: passed with existing chunk-size/dynamic-import warnings.
- `npm run frontend:build`: passed with existing chunk-size/dynamic-import warnings.
- `cd server && npm test`: no `test` script exists.
- `cd server && npm run build`: no `build` script exists.

## 15. Remaining limitations
- The new backtest route resolves historical datasets and returns structured results/data-source metadata, but strategy execution remains constrained by the existing strategy engine availability; it returns structured `not_enough_data`/implementation messages rather than fake trades.
- Provider availability still depends on actual provider/network behavior and credentials where required.
