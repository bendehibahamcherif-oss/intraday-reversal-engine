# ML Dataset Selection → Training Fix Report

## Root Cause

**Single-workspace renderer + event-based propagation = timing gap.**

The app renders exactly one workspace at a time via a `switch` in `WorkspaceRenderer`. When the user is on the Historical Data workspace and clicks "Use for ML Training":

1. `historicalDataStore.useDatasetForMl(dataset)` sets `selectedMlDatasetId` in the store ✅
2. A `reversal:use-dataset-ml` custom event is dispatched on `window`
3. Both `AILabWorkspace` and `MLDashboard` have `useEffect` listeners for this event — **but neither is mounted**
4. The event fires into the void; `aiLabStore.selectedMlDatasetId` and `mlStore.pendingDatasetId` stay `null`
5. User navigates to AI Lab or ML Engine
6. Workspace mounts, registers listener — event already fired, nothing received
7. User clicks Train → `datasetId` not in payload → backend returns `dataset_missing`

The `historicalDataStore` Zustand store DID persist the selection correctly. The bug was purely in the event-based handoff between workspaces.

---

## Before / After Frontend Train Payloads

**Before (broken):**
```json
POST /api/ml/train
{ "symbol": "SPY", "horizon": 10, "limit": 50,
  "modelType": "xgboost", "nEstimators": 200 }
← no datasetId
→ { "ok": false, "status": "dataset_missing",
    "message": "No dataset snapshot found." }
UI: Status: dataset_missing
```

**After (fixed):**
```json
POST /api/ml/train
{ "symbol": "SPY", "horizon": 10, "limit": 50,
  "modelType": "xgboost", "nEstimators": 200,
  "datasetId": "hist_SPY_1d_RTH_202506_202606_yahoo" }
← datasetId included
→ { "ok": true, "status": "trained", "modelId": "rf_v1_..." }
   or precise error: dataset_file_missing / not_enough_data
UI: Status: trained  (or precise error, never dataset_missing)
```

---

## Whether selectedDatasetId Reached AI Lab

**Before:** No — event fired before workspace mounted. `aiLabStore.selectedMlDatasetId = null`.

**After:** Yes — on mount, `AILabWorkspace` bootstraps from `historicalDataStore.getState().selectedMlDatasetId`.

---

## Whether selectedDatasetId Reached Backend

**Before:** No — omitted from payload entirely.

**After:** Yes — `aiLabStore.trainModel()` reads `selectedMlDatasetId` (now populated via bootstrap) and includes it as `datasetId`.

---

## Files Changed

| File | Change |
|------|--------|
| `src/workspaces/AILabWorkspace.jsx` | Added `useHistoricalDataStore` import; added bootstrap on mount in event listener `useEffect`; improved dataset display (shows rows, "No historical dataset selected" when empty) |
| `src/workspaces/MLDashboard.jsx` | Added `useHistoricalDataStore` import; added bootstrap on mount in event listener `useEffect`; updated event handler to pass full `dataset` object to `setPendingDatasetId` |

---

## Bootstrap Logic (both files)

```js
useEffect(() => {
  // Workspace mounts AFTER the event fires when navigating from HistoricalData.
  // Read the persisted selection from historicalDataStore.
  const { selectedMlDatasetId: histId, selectedMlDataset: histDataset } =
    useHistoricalDataStore.getState();
  if (histId && !<localStore>.getState().<pendingField>) {
    <setter>(histId, histDataset);
  }

  function onDatasetMl(e) { /* ...existing listener... */ }
  window.addEventListener('reversal:use-dataset-ml', onDatasetMl);
  return () => window.removeEventListener('reversal:use-dataset-ml', onDatasetMl);
}, []);
```

The `!<pendingField>` guard prevents overwriting a dataset that was already set within the current session.

---

## Backend Registry Lookup Result

`trainingService.trainModel` already had the correct datasetId resolution flow from a previous fix. When `datasetId` is provided:

1. Validates ID format → `invalid_dataset_id` if malformed
2. Looks up in `historicalDatasetRegistry` by `datasetId` or `id` → `dataset_not_found` if absent
3. Calls `resolveDatasetFile(dataset)` → `dataset_file_missing` or `dataset_file_empty`
4. Injects resolved file path and calls Python training pipeline

Generic `dataset_missing` is only returned when no `datasetId` AND no auto-detected default snapshot.

---

## File Diagnostics

`GET /api/historical/datasets/:datasetId/diagnostics` (added previously) returns:

```json
{
  "ok": true,
  "datasetId": "hist_SPY_1d_RTH_202506_202606_yahoo",
  "registryFound": true,
  "fileExists": true,
  "fileSizeBytes": 6144,
  "usableForMl": true,
  "issues": []
}
```

The Historical Data workspace already shows `status: ready` and `file exists` for the dataset — confirming the file is reachable from the backend. The issue was never file resolution; it was state propagation.

---

## Tests Added

New test file: `src/test/mlDatasetSelectionToTraining.test.js` — **18 tests**

- `historicalDataStore.useDatasetForMl` sets `selectedMlDatasetId` correctly
- Returns `ok:false` and leaves state clean when dataset has no id
- Never returns `datasetId: "undefined"`
- `aiLabStore.setSelectedDataset` sets `selectedMlDatasetId` and `selectedMlDataset`
- `aiLabStore.trainModel` includes `datasetId` when `selectedMlDatasetId` is set
- `aiLabStore.trainModel` omits `datasetId` when null
- Never sends `"undefined"` as datasetId
- `trainingJob` stores the backend result (status displayed in UI)
- Bootstrap: `historicalDataStore` retains `selectedMlDatasetId` after navigation
- Bootstrap: `aiLabStore` can self-bootstrap from `historicalDataStore` on mount
- Bootstrap: `mlStore` can self-bootstrap from `historicalDataStore` on mount
- Full E2E: bootstrap → `aiLabStore.trainModel` → correct datasetId
- Full E2E: bootstrap → `mlStore.startTraining` → correct datasetId
- Backend path: `dataset_not_found` result stored as `trainingJob`, not `dataset_missing`
- `mlStore.startTraining` includes `datasetId` from `pendingDatasetId`

---

## Validation Steps

1. Open Historical Data → confirm dataset shows `status: ready`, 251 rows, file exists
2. Click "Use for ML Training"
3. Navigate to AI Lab → "Selected dataset: hist_SPY_1d_RTH_202506_202606_yahoo" visible
4. Click "⚡ Train Model"
5. Request payload includes `datasetId: "hist_SPY_1d_RTH_202506_202606_yahoo"`
6. Backend response is `trained` / `not_enough_data` / precise error — **never `dataset_missing`**

---

## Definition of Done ✅

| Requirement | Status |
|-------------|--------|
| Historical dataset ready state recognized by ML Training | ✅ |
| AI Lab displays selected datasetId | ✅ (bootstrap fix) |
| Train Model sends datasetId | ✅ |
| Backend no longer returns dataset_missing when datasetId is selected | ✅ |
| Tests pass | ✅ 169/169 |
