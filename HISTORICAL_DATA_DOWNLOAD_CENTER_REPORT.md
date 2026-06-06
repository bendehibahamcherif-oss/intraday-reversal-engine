# Historical Data Download Center Report

**Branch**: `claude/intraday-reversal-frontend-audit-cM6Lu`
**Session**: 2026-06-05
**Status**: All phases complete, 90 tests passing, build clean.

---

## Summary

Full end-to-end historical data pipeline implemented across both repos.
Users can now choose a provider, enter symbols and a date range, download real historical candles, store them in a named dataset registry, and reuse those datasets for ML training, backtesting, and correlation analysis.

---

## Backend Files Created

### `server-deliverables/historical/canonicalSchema.js`

- Constants: `SUPPORTED_TIMEFRAMES`, `SUPPORTED_SESSIONS`, `SUPPORTED_PURPOSES`, `CSV_HEADER`
- `normalizeCandle()` — field aliasing, epoch/ISO timestamp normalization, OHLC validation
- `validateAndClean()` — normalize → session filter → sort → deduplicate; returns `{ candles, dropped, warnings }`
- `sessionFilter()` — precise US DST-aware RTH (09:30–16:00 ET), EXTENDED (04:00–09:30 + 16:00–20:00), ALL
- `toCsvRow()` — candle → CSV row

### `server-deliverables/historical/providerCapabilities.js`

Capability matrix for all 5 providers:

| Provider | Historical | Requires Key | Max Intraday Days (1m) |
|---|---|---|---|
| yahoo | ✅ | No | 7 |
| polygon | ✅ | Yes | unlimited |
| alphaVantage | ✅ | Yes | unlimited (monthly slices) |
| twelvedata | ✅ | Yes | unlimited |
| fallback_demo | ❌ | — | blocked |

### `server-deliverables/historical/historicalDatasetRegistry.js`

File-backed JSON registry at `data/historical/datasets.json`:
- `generateDatasetId()` — deterministic human-readable ID (e.g. `hist_SPY_QQQ_1d_RTH_20240101_20241231_yahoo`)
- `safePath()` — path traversal guard
- `list()`, `get()`, `register()`, `remove()` (deletes associated CSV/JSON files)
- Dataset ID validated against `/^[a-zA-Z0-9_-]{1,200}$/`

### Provider Adapters

Each adapter implements `fetchHistoricalCandles({ symbol, startDate, endDate, timeframe, apiKey })`:

| File | Approach |
|---|---|
| `yahooHistoricalProvider.js` | `period1`/`period2` epoch timestamps via Yahoo v8 chart API; per-timeframe date range limits |
| `polygonHistoricalProvider.js` | `/v2/aggs/ticker/{ticker}/range/{mult}/{timespan}/{from}/{to}` with pagination (up to 10 pages) |
| `alphaVantageHistoricalProvider.js` | `TIME_SERIES_DAILY_ADJUSTED` for `1d`; `TIME_SERIES_INTRADAY` with monthly slices for intraday |
| `twelveDataHistoricalProvider.js` | `time_series?start_date=...&end_date=...&order=ASC&outputsize=5000` |

### `server-deliverables/historical/historicalDataService.js`

Main orchestrator:
- Validates all inputs (symbols ≤ 20, timeframe, dates, session, purpose)
- Blocks `fallback_demo` → `{ ok: false, error: { code: 'DEMO_NOT_ALLOWED' } }`
- `provider: 'auto'` → resolves to first credentialed provider (polygon → alphaVantage → twelvedata → yahoo)
- Loops over symbols, calls provider adapter, normalizes via `validateAndClean`
- Writes CSV and/or JSON to `data/historical/{purpose}/`
- Computes SHA-256 `dataHash` for change detection
- Caches by datasetId (skips re-download if `status === 'ready'` and `!forceRefresh`)
- Registers dataset in registry

### `server-deliverables/api/historicalRoutes.js`

Mounted at `/api/historical`:

| Endpoint | Description |
|---|---|
| `GET /providers` | List available providers with capability info |
| `GET /datasets` | List all registered datasets |
| `GET /datasets/:datasetId` | Get one dataset record |
| `DELETE /datasets/:datasetId` | Remove dataset record + files |
| `POST /download` | Trigger download: `{ provider, symbols, timeframe, startDate, endDate, session, purpose, outputFormat, forceRefresh }` |
| `GET /jobs/:jobId` | Synchronous stub for job status (downloads are sync) |

### `server/index.cjs` (modified)

Added:
```js
const historicalRoutes = require('../server-deliverables/api/historicalRoutes');
app.use('/api/historical', historicalRoutes);
```

---

## ML Integration (Phase 8)

### `server-deliverables/ai/mlRoutes.js` (modified)

`POST /api/ml/train` now accepts `datasetId`:
- Looks up dataset in registry
- Parses CSV, filters rows by training symbol
- Passes candles array to `runTraining()`
- Response includes `{ datasetId, datasetRowCount }`

---

## Backtest Integration (Phase 9)

### `server-deliverables/api/historicalRoutes.js` (GET /providers + store integration)

`POST /api/backtest/run/:symbol` request body now accepts `datasetId` (passed through unchanged — the backtest engine reads it).

---

## Correlation Integration (Phase 10)

### `server-deliverables/api/multiAssetRoutes.js` (modified)

`GET /api/multi-asset/correlation?datasetId=...`:
- Loads dataset CSV/JSON from registry
- Groups closes by symbol
- Computes correlation matrix via `engine._internal.logReturns` + `pearsonCorrelation`
- Returns `{ ok, datasetId, symbols, matrix, observations }` or `not_enough_data` variant
- Falls through to live `historicalStore` path when no `datasetId`

---

## Frontend Files Created / Modified

### New: `src/store/historicalDataStore.js`

Zustand store with:
- `fetchProviders()` → `GET /api/historical/providers`
- `fetchDatasets()` → `GET /api/historical/datasets`
- `downloadData(params)` → `POST /api/historical/download`
- `deleteDataset(datasetId)` → `DELETE /api/historical/datasets/:id`
- `selectDataset(datasetId)` / `clearSelection()`
- `selectedDatasetId`, `selectedDataset` — shared state for cross-workspace use

### New: `src/workspaces/HistoricalDataWorkspace.jsx`

Terminal-style workspace with two panels:
- **Left**: Dataset list — shows all registered datasets with symbol, timeframe, date range, provider, session, purpose, row count, status
- **Right (Download tab)**: Form with provider dropdown, symbols input, timeframe, session, start/end date, purpose, output format checkboxes, force-refresh toggle
- **Right (Detail tab)**: Selected dataset details + action buttons:
  - **Use for ML Training** → dispatches `reversal:use-dataset-ml` event
  - **Use for Backtesting** → dispatches `reversal:use-dataset-backtest` event
  - **Use for Correlation** → dispatches `reversal:use-dataset-correlation` event

Provider dropdown never shows `fallback_demo`.

### Modified: `src/api.js`

New methods added:
- `getHistoricalProviders()`
- `getHistoricalDatasets()`
- `getHistoricalDataset(datasetId)`
- `deleteHistoricalDataset(datasetId)`
- `downloadHistoricalData(params)`
- `trainMLModelP1` updated to accept `datasetId`
- `runBacktest` updated to accept `datasetId`
- `getMultiAssetCorrelation` updated to accept `datasetId`

### Modified: `src/App.jsx`

Added import + case:
```jsx
case 'HistoricalData': return <HistoricalDataWorkspace />;
```

### Modified: `src/TerminalSidebar.jsx`

Added nav item:
```js
{ id: 'HistoricalData', abbr: 'HD', title: 'Historical Data', shortcut: '' }
```

### Modified: `src/store/mlStore.js`

- Added `pendingDatasetId: null` state field
- `startTraining()` now passes `pendingDatasetId` to `trainMLModelP1`
- `setPendingDatasetId(id)` / `clearPendingDatasetId()` actions

`MLDashboard.jsx`: listens for `reversal:use-dataset-ml` event → sets `pendingDatasetId`, switches to Training Runs tab, shows banner.

### Modified: `src/store/macroStore.js`

- Added `correlationDatasetId: null` state field
- `loadCorrelation()` passes `datasetId` when set
- `setCorrelationDatasetId(id)` / `clearCorrelationDatasetId()` actions

`MacroWorkspace.jsx`: listens for `reversal:use-dataset-correlation` event → calls `setCorrelationDatasetId` + `loadCorrelation`.

### Modified: `src/store/quantLabStore.js`

- Added `backtestPendingDatasetId: null` state field
- `runBacktest()` passes `backtestPendingDatasetId` to `api.runBacktest`
- `setBacktestPendingDatasetId(id)` / `clearBacktestPendingDatasetId()` actions

`QuantLabWorkspace.jsx`: listens for `reversal:use-dataset-backtest` event → calls `setBacktestPendingDatasetId`, shows dataset banner in Strategy Candidates panel.

---

## Security

| Constraint | Implementation |
|---|---|
| No fake data | No synthetic data generated; providers return real candles or error |
| No fallback_demo | `downloadHistoricalData` blocks `provider === 'fallback_demo'` with `DEMO_NOT_ALLOWED` |
| No path traversal | `safePath()` in registry throws if path leaves `DATA_DIR` |
| Max symbols | `MAX_SYMBOLS = 20` enforced in service |
| Dataset ID validation | `/^[a-zA-Z0-9_-]{1,200}$/` regex |
| API keys backend-only | Credentials resolved from env vars in service; never sent to frontend |

---

## Phase 16 — Tests

New test file: `src/test/historicalDataCenter.test.js` — 18 tests:

| Test | Validates |
|---|---|
| `fetchProviders stores provider list` | Success path |
| `fetchProviders sets error on failure` | Error path |
| `fallback_demo has historical: false` | Demo blocked |
| `fetchDatasets stores datasets array` | Success path |
| `fetchDatasets stores empty array` | Empty state |
| `downloadData stores result on success` | Download success |
| `downloadData sets error on failure` | Download error |
| `selectDataset sets selectedDatasetId` | Selection |
| `clearSelection resets` | Deselection |
| `deleteDataset removes from list` | Deletion |
| `deleteDataset clears selected if deleted` | Selected-delete |
| `setPendingDatasetId stores id (ML)` | ML dataset state |
| `clearPendingDatasetId resets (ML)` | ML clear |
| `startTraining passes pendingDatasetId` | ML training integration |
| `setCorrelationDatasetId stores id` | Correlation state |
| `clearCorrelationDatasetId resets` | Correlation clear |
| `setBacktestPendingDatasetId stores id` | Backtest state |
| `clearBacktestPendingDatasetId resets` | Backtest clear |

---

## Phase 17 — Validation

```
Test Files  7 passed (7)
     Tests  90 passed (90)          [+18 new tests]
  Duration  3.78s

Build: vite build ✓ (2.04s, no errors)
```

---

## Checklist — Mission Completion

| Requirement | Status |
|---|---|
| User can choose provider | ✅ Provider dropdown (auto + yahoo/polygon/alphaVantage/twelvedata) |
| User can choose symbols | ✅ Comma-separated input, max 20, uppercased |
| User can choose start/end dates | ✅ Date pickers |
| User can choose timeframe | ✅ 1m/5m/15m/30m/1h/1d |
| User can download real historical candles | ✅ Real provider adapters, no synthetic data |
| Dataset is stored and listed | ✅ JSON registry + DatasetList panel |
| Dataset can be reused for ML training | ✅ datasetId → POST /api/ml/train |
| Dataset can be reused for backtesting | ✅ datasetId → POST /api/backtest/run |
| Dataset can be reused for correlation | ✅ datasetId → GET /api/multi-asset/correlation |
| fallback_demo not usable as historical source | ✅ DEMO_NOT_ALLOWED error; filtered from UI |
| No fake data generated | ✅ Providers return errors, not synthetic candles |
| Credentials backend-only | ✅ Env vars only; never in frontend localStorage |
