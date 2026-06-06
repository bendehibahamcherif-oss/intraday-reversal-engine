# ML Dataset Missing — Root Cause Fix Report

## Summary

Selecting a historical dataset in the Historical Data workspace and clicking
Train in the ML Engine workspace was silently returning a generic
`dataset_missing` error instead of using the selected dataset.  Six
independent root causes were found and fixed.

---

## Root Causes and Fixes

### 1. HTTP 200 + `ok:false` not propagated as an error

**File:** `src/store/mlStore.js` — `startTraining()`

**Before:** `trainMLModelP1` resolved to `{ ok: false, status: 'dataset_missing' }`.
`startTraining` stored the result without checking `ok`, so `trainingError`
was never set and no UI feedback was shown.

**After:** `startTraining` checks `data.ok === false` and sets both
`trainingError` (the message string) and `lastTrainingResult` (the full
result). The `TrainingRunsPanel` renders both.

---

### 2. `datasetId` not forwarded from frontend to API call

**File:** `src/store/mlStore.js` — `startTraining()`, `setPendingDatasetId()`

**Before:** When a user dispatched `reversal:use-dataset-ml`, the selected
`datasetId` was never included in the body of `POST /api/ml/train`.

**After:**
- `pendingDatasetId` state field added to `mlStore`.
- `setPendingDatasetId(id)` / `clearPendingDatasetId()` actions added.
- `startTraining()` spreads `{ datasetId: pendingDatasetId }` into the request
  when a pending dataset is set.

---

### 3. Backend never received `datasetId` — fell through to default path search

**File:** `server-deliverables/ai/trainingService.js` — `trainModel()`

**Before:** `trainModel` called `validateRequest()` and then
`resolveDatasetPath(request.datasetPath)`.  If `datasetPath` was empty it
searched default snapshot locations, found nothing, and returned
`dataset_missing`.  No `datasetId` handling existed.

**After:** When `body.datasetId` is present, the function:
1. Validates the ID format (`/^[a-zA-Z0-9_-]{1,200}$/`).
2. Loads the historical registry and looks up by `datasetId` OR `id`.
3. Returns `dataset_not_found` (with `availableDatasetIds`) if absent.
4. Calls `resolveDatasetFile(dataset)` to validate the file on disk.
5. Returns `dataset_file_missing` or `dataset_file_empty` as appropriate.
6. Injects `resolvedPath` as `body.datasetPath` for the downstream pipeline.

**Error priority:** `invalid_dataset_id` → `dataset_not_found` →
`dataset_file_missing` → `dataset_file_empty` → `not_enough_data` → `trained`.
The generic `dataset_missing` is only returned when **no** `datasetId` and
**no** auto-detected default snapshot exist.

---

### 4. File existence not validated at the `GET /datasets` layer

**File:** `server-deliverables/api/historicalRoutes.js`

**Before:** `GET /api/historical/datasets` returned raw registry records; no
file existence check.  The UI could show a dataset as "ready" even if its
file had been deleted on the server.

**After:** `annotateDataset(ds)` calls `resolveDatasetFile` and stamps each
record with `fileExists: boolean` and `status: 'file_missing'` when the file
is gone.  Both `GET /datasets` and `GET /datasets/:id` use this helper.

---

### 5. No diagnostic endpoint to verify file usability

**File:** `server-deliverables/api/historicalRoutes.js`

**Before:** No way for the UI to confirm a dataset file was reachable before
attempting training.

**After:** New endpoint `GET /api/historical/datasets/:datasetId/diagnostics`
returns:
```json
{
  "ok": true, "datasetId": "...", "registryFound": true,
  "fileExists": true, "fileSizeBytes": 12345,
  "usableForMl": true, "issues": [],
  "candidatePaths": [...], "resolvedPaths": [...]
}
```

---

### 6. Frontend displayed no feedback for `ok:false` training results

**Files:** `src/components/TrainingRunsPanel.jsx`, `src/store/mlStore.js`

**Before:** No UI component showed the pending dataset or the training result
status.

**After:**
- `TrainingStatusBanner` renders a blue chip for the queued dataset, a red
  box for errors (with human-readable `STATUS_LABELS` per error code), and a
  green box on success.
- `HistoricalDataWorkspace` — `DatasetDetail` hides "Use for ML/Backtest/
  Correlation" when `fileMissing` is true and shows a red warning.
- `handleUseForML` logs `{ action, datasetId, dataset, selectedMlDatasetId }`
  in dev mode to confirm the event payload.
- `diagnostics` / `diagnosticsLoading` from `historicalDataStore` are passed
  to `DatasetDetail`.

---

## Files Changed

| File | Change |
|------|--------|
| `server-deliverables/ai/trainingService.js` | Added `resolveDatasetFile()`; datasetId resolution block in `trainModel()`; dev debug log |
| `server-deliverables/ai/mlRoutes.js` | HTTP status mapping (`STATUS_HTTP`); dev debug log; pass-through to trainingService |
| `server-deliverables/api/historicalRoutes.js` | `annotateDataset()` helper; file-existence on list/get endpoints; new diagnostics endpoint |
| `src/store/mlStore.js` | `pendingDatasetId` state; `startTraining` checks `ok:false`; `setPendingDatasetId` / `clearPendingDatasetId` |
| `src/store/historicalDataStore.js` | `diagnostics` state; `selectDataset` auto-fetches diagnostics; `fetchDiagnostics` action |
| `src/api.js` | `getHistoricalDatasetDiagnostics()`; merged `trainMLModelP1` signature |
| `src/components/TrainingRunsPanel.jsx` | `TrainingStatusBanner`; `STATUS_LABELS`; pending/result state selectors |
| `src/workspaces/HistoricalDataWorkspace.jsx` | `diagnostics`/`diagnosticsLoading` props wired to `DatasetDetail`; dev debug log in `handleUseForML`; `file_missing` warning + button guard |

---

## Before / After Payloads

**Before (broken):**
```
POST /api/ml/train  { symbol: "SPY", timeframe: "1m" }
                    ← datasetId omitted entirely
→ { ok: false, status: "dataset_missing" }
   UI: no error shown (ok:false not checked)
```

**After (fixed):**
```
POST /api/ml/train  { datasetId: "hist_SPY_1d_RTH_20240101_20241231_yahoo",
                      symbol: "SPY", timeframe: "1m" }
→ { ok: true, status: "trained", modelId: "rf_v1_...", datasetId: "..." }
   UI: green "Training complete · model rf_v1_..." banner
```

**Error case (file missing):**
```
POST /api/ml/train  { datasetId: "hist_SPY_1d_..." }
→ HTTP 400 { ok: false, status: "dataset_file_missing",
             message: "...exists in registry but file does not exist...",
             datasetId: "hist_SPY_1d_..." }
   UI: red "dataset_file_missing: Dataset file is missing on the server.
            Re-download the dataset." banner
```

---

## Tests

New test file: `src/test/mlDatasetMissingFix.test.js` — 23 tests.

Backend (9 tests):
- `resolveDatasetFile` with valid CSV → `issue: null`
- `resolveDatasetFile` with `filePath` field → `issue: null`
- `resolveDatasetFile` with no path fields → `dataset_file_missing`
- `resolveDatasetFile` with non-existent path → `dataset_file_missing`
- `resolveDatasetFile` with empty file → `dataset_file_empty`
- `GET /datasets` returns `fileExists: false` for missing-file dataset
- `GET /datasets` returns `fileExists: true` for present-file dataset
- `GET /datasets/:id/diagnostics` returns `usableForMl: true` when file exists
- `GET /datasets/:id/diagnostics` returns `usableForMl: false` for missing file
- Diagnostics for unknown ID returns `registryFound: false`
- Registry lookup by `datasetId` field works
- Registry `get()` returns null for unknown id
- JSON responses contain no `undefined` literals

Frontend (10 tests):
- `selectDataset` sets `selectedDatasetId` and fetches diagnostics
- Diagnostics result stored in store state
- `startTraining` includes `pendingDatasetId` as `datasetId`
- `startTraining` omits `datasetId` when no pending dataset
- `startTraining` sets `trainingError` for `dataset_not_found`
- `startTraining` sets `trainingError` for `dataset_file_missing`
- Never returns `dataset_missing` when `datasetId` was provided
- `clearPendingDatasetId` resets to null
- `clearSelection` resets selectedDatasetId and diagnostics

All 129 suite tests pass. Build clean.

---

## Definition of Done — Verification

| Requirement | Status |
|-------------|--------|
| No generic `dataset_missing` when `datasetId` selected | ✅ Precise code returned |
| Backend returns `dataset_not_found`, `dataset_file_missing`, `dataset_file_empty` | ✅ |
| ML train request includes `datasetId` | ✅ via `pendingDatasetId` |
| Dataset diagnostics endpoint confirms file usability | ✅ `/api/historical/datasets/:id/diagnostics` |
| Frontend shows selected `datasetId` | ✅ `TrainingStatusBanner` blue chip |
| No undefined `datasetId` in requests | ✅ conditional spread guards |
| Tests pass | ✅ 129/129 |
