# Functional Bug Fix Report — Production Hardening

**Branch**: `claude/intraday-reversal-frontend-audit-cM6Lu`  
**Session**: 2026-06-04  
**Status**: All phases complete, 72 tests passing, build clean.

---

## Phase 1 — Backend Route Inventory (Audit)

### ML Routes (`/api/ml`)

| Endpoint | Status | Notes |
|---|---|---|
| `POST /api/ml/infer/:symbol` | ✅ Exists | Fixed: was returning 422 on no-champion; now 200 ok:false |
| `GET /api/ml/health` | ✅ Exists | Returns worker pool health |
| `GET /api/ml/model` | ✅ Exists | Returns model_metadata.json; empty-safe |
| `POST /api/ml/train` | ✅ Exists | Spawns Python training process |
| `GET /api/ml/predictions` | ✅ Exists | Returns `{ ok: true, predictions: [] }` |
| `GET /api/ml/training-runs` | ✅ Exists | Returns `{ ok: true, activeJobs: [] }` |
| `GET /api/ml/model-runs` | ✅ Exists | Alias for training-runs |
| `GET /api/ml/model-card` | ✅ Exists | Returns `{ ok: true, content: null }` if not found |
| `GET /api/ml/schema` | ✅ Exists | Returns feature schema |
| `GET /api/ml/signal/:symbol` | ✅ Exists | Returns empty signal state |
| `GET /api/ml/feature-importance` | ✅ Exists | Returns `{ ok: true, features: [] }` if no model |
| `GET /api/ml/drift` | ✅ Exists | Returns `{ ok: true, drift: { psi: {}, status: 'not_enough_data' } }` |
| `GET /api/ml/metrics` | ❌ **MISSING** → **ADDED** | Called by `loadDiagnostics()` |
| `GET /api/ml/models` | ❌ **MISSING** → **ADDED** | Called by `loadModels()` |
| `GET /api/ml/worker/status` | ❌ **MISSING** → **ADDED** | Called by `getMLWorkerStatus()` |
| `POST /api/ml/models/:version/promote` | ❌ **MISSING** → **ADDED** | Called by `promoteModel()` |

### Provider Routes (`/api/providers`) — All present ✅
### Feed Routes (`/api/feeds`, `/api/feed`, `/api/market`) — All present ✅

---

## Phase 2 — Fix ML "Endpoint not available"

### Root Cause

Every page load of `MLDashboard.jsx` called `loadDiagnostics()` → `api.getMLMetrics()` → `GET /api/ml/metrics`. This route was absent from the reversal backend → 404 → `STATUS_MESSAGES[404]` = `"Endpoint not available"` → stored in `diagnosticsError` → displayed in `MLDiagnosticsPanel`.

Similarly:
- `loadModels()` → `GET /api/ml/models` → missing → 404
- `promoteModel()` → `POST /api/ml/models/:version/promote` → missing → 404

### Fixes Applied

**`/home/user/reversal/server/api/mlRoutes.js`**

1. `GET /api/ml/metrics` added — returns combined worker health + model version:
   ```json
   { "ok": true, "model": null, "workerStatus": "idle", "totalRequests": 0, "errors": 0 }
   ```

2. `GET /api/ml/models` added — returns model list from metadata (empty-safe):
   ```json
   { "ok": true, "models": [], "champion": null, "status": "no_model" }
   ```

3. `GET /api/ml/worker/status` added — delegates to `pythonInference.health()`:
   ```json
   { "ok": true, "workerAlive": false, "status": "idle", "totalRequests": 0 }
   ```

4. `POST /api/ml/models/:version/promote` added — stub for single-champion architecture:
   ```json
   { "ok": true, "promoted": false, "status": "no_op" }
   ```

5. `POST /api/ml/infer/:symbol` **no-champion response changed from 422 → 200**:
   ```json
   { "ok": false, "status": "no_champion_model", "code": "NO_CHAMPION", "message": "..." }
   ```

**`src/store/mlStore.js`** (frontend)

`fetchTrainingRuns()` normalization fixed — backend sends `activeJobs`, not `models`:

```diff
-const runs = Array.isArray(data) ? data : (data.models || []);
+const runs = Array.isArray(data) ? data : (data.activeJobs || data.runs || data.models || []);
```

---

## Phase 3 — Provider/fallback_demo Persistence

### Analysis

- `resolveActiveState()` adds `fallback_demo` only when `validProviders` is empty (emergency fallback). This is correct behavior.
- `yahoo` provider does NOT require credentials and has a `status()` function → `getRuntimeState('yahoo').valid = true` always.
- `persistActiveProviderState()` correctly saves selections via `activeProviderStore`.

### Real Bug Found: Object Error → `[object Object]` Message

Several provider endpoints return `{ success: false, error: { code: '...', message: '...' } }` (object-shaped error). The frontend's `handle()` function was using the object directly as the error message:

```js
// Before — body.error is an object → new Error({ ... }) → message = '[object Object]'
const message = body.error || body.message || STATUS_MESSAGES[res.status];
```

**Fix in `src/api.js`**:
```js
const rawError = body.error;
const message = (typeof rawError === 'string' ? rawError : rawError?.message)
  || body.message
  || STATUS_MESSAGES[res.status]
  || `HTTP ${res.status}`;
err.code = typeof rawError === 'object' ? rawError?.code : undefined;
```

---

## Phase 4 — Live Data Status Consistency

### Root Cause

Yahoo provider's `status()` returns `{ status: 'fallback_delayed', connected: false }`. The `toCanonicalProvider()` function only mapped status to `'delayed'` for providers with `credentialStatus === 'configured'`. Yahoo has `credentialStatus: 'not_required'`, so it kept `runtimeStatus: 'fallback_delayed'`.

The frontend's `statusLabel()` function checked `connected: false` → displayed `"NOT CONNECTED (yahoo)"` instead of `"DELAYED (yahoo)"`.

### Fix in `feedManager.js`

In `toCanonicalProvider()`: normalize any non-standard status to `'delayed'` for candle providers that are not connected:

```js
if (delayed && !provider.connected && runtimeStatus !== 'idle_demo' && runtimeStatus !== 'unknown' && ...) {
  runtimeStatus = 'delayed';
}
```

### Fix in `LiveDataWorkspace.jsx`

`statusLabel()` now returns `"DELAYED (source)"` when the runtime/feed status indicates a delayed provider:

```js
const isDelayed = runtimeStatus === 'delayed' || runtimeStatus.includes('delayed');
if (!connected && isDelayed) return `DELAYED (${source})`;
```

---

## Phase 5 — API Contract Hardening

- `POST /api/ml/infer/:symbol` now returns HTTP 200 with `ok: false` when no champion model exists (previously HTTP 422 which `handle()` treated as a thrown error).
- `handle()` in `api.js` now correctly extracts string messages from object-shaped `body.error`.

---

## Phase 6 — Tests

New test file: `src/test/mlEndpointFixes.test.js` — 11 tests covering:

| Test | Validates |
|---|---|
| `fetchTrainingRuns normalizes activeJobs` | Fix for mlStore.js |
| `fetchTrainingRuns handles empty activeJobs` | Empty-state safety |
| `fetchTrainingRuns falls back to runs key` | Alternative response shapes |
| `fetchTrainingRuns returns an array always` | No undefined bug |
| `loadDiagnostics stores data without error` | /metrics empty-state |
| `loadDiagnostics sets error when API throws` | Error handling path |
| `loadModels stores empty array` | /models empty-state |
| `loadModels stores champion model` | /models populated state |
| `Object error message is readable` | handle() fix validation |
| `fetchDriftMetrics not_enough_data state` | /drift empty-state |
| `fetchPredictionHistory empty state` | /predictions empty-state |

---

## Phase 7 — Validation

```
Test Files  6 passed (6)
     Tests  72 passed (72)          [+11 new tests]
  Duration  7.61s

Build: vite build ✓ (2.20s, no errors)
```

---

## Summary

| Phase | Issue | Root Cause | Fix |
|---|---|---|---|
| 2 | `"Endpoint not available"` in ML dashboard | 4 routes missing from reversal backend | Added routes; fixed 422→200 for no-champion |
| 2 | Training runs never show | `fetchTrainingRuns` normalized `data.models` but backend sends `data.activeJobs` | Fixed normalization to prefer `activeJobs` |
| 3 | `"[object Object]"` provider errors | `handle()` used object `body.error` as message | Extract `.message` from object errors |
| 4 | Yahoo shows `"NOT CONNECTED"` | `toCanonicalProvider()` kept `'fallback_delayed'`; `statusLabel()` used `connected` bool only | Normalize to `'delayed'`; show "DELAYED" in UI |
| 5 | `infer` 422 causes UI error | HTTP 422 → `handle()` throws → error shown | Return HTTP 200 `ok:false` for no-champion |

All fixes are scoped to proven functional bugs. No UI layout, navigation, panel, sidebar, or design changes were made.
