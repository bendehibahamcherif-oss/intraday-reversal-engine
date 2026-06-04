# GLOBAL PLATFORM FIX REPORT — intraday-reversal-engine

**Report date**: 2026-06-04  
**Branch**: `claude/intraday-reversal-frontend-audit-cM6Lu`  
**Test status**: 46/46 passing  

---

## EXECUTIVE SUMMARY

This branch resolves 11 production-grade issues across the frontend. All fixes are non-destructive, backwards-compatible, and validated by the test suite. No ML logic, provider business logic, or backend core was modified.

---

## FIXES APPLIED

### FIX-01: Portfolio / Risk 404s
**Severity**: High  
**Root cause**: `/api/portfolio/*` and `/api/paper/*` routes were not registered in `server/index.cjs`.  
**Fix**: Created `server-deliverables/api/portfolioRoutes.js` with 9 routes returning stable empty shapes (HTTP 200, `ok: false`). Mounted in `server/index.cjs`.  
**Files changed**: `server-deliverables/api/portfolioRoutes.js` (new), `server/index.cjs`  

### FIX-02: WebSocket always DISCONNECTED on HTTPS
**Severity**: High  
**Root cause**: `wsClient.js` constructed `ws://` URL from `VITE_API_BASE` even when the app was served over `https://`.  
**Fix**: Added `resolveWsUrl()` that derives `wss://` when protocol is `https:` or when `VITE_API_BASE` starts with `https://`. Falls back to `window.location` origin before hardcoded localhost.  
**Files changed**: `src/services/wsClient.js`  

### FIX-03: ML model endpoint 404
**Severity**: High  
**Root cause**: `/api/ml/model` returned HTTP 404 when no champion model was loaded.  
**Fix**: Changed to return HTTP 200 with `{ ok: false, status: 'no_champion', model: null }`.  
**Files changed**: `server-deliverables/ai/mlRoutes.js`  

### FIX-04: React crash "System Error / A terminal component crashed"
**Severity**: High  
**Root cause**: `ErrorBoundary.jsx` caught errors but displayed only "System Error" with no actionable information or recovery path.  
**Fix**: Redesigned ErrorBoundary to show the error message, component stack (dev only), and two recovery buttons: "Reset App State" (clears stores) and "Reload Page".  
**Files changed**: `src/components/ErrorBoundary.jsx`  

### FIX-05: `d.toFixed is not a function` production crash (Phase 1 — 5 components)
**Severity**: Critical  
**Root cause**: Vite minifies variable names to single letters. `.toFixed()` is a `Number.prototype` method — calling it on a string API value (even one that passes a `!= null` guard) throws `TypeError: d.toFixed is not a function`.  
**Fix**: Replaced all `value.toFixed(n)` calls in components receiving API data with `Number(value).toFixed(n)`. `Number()` coerces strings to numbers; `NaN.toFixed()` returns `"NaN"` (visible but not a crash).  
**Files changed**: `src/components/DriftDashboard.jsx`, `src/components/FeatureImportanceTable.jsx`, `src/workspaces/MacroWorkspace.jsx`, `src/components/ModelCardViewer.jsx`, `src/StrategyAnalyzer.jsx`  

### FIX-06: Raw "HTTP 404" shown in UI error messages
**Severity**: Medium  
**Root cause**: `feedStore.normalizeError()` forwarded raw HTTP status codes verbatim to the UI.  
**Fix**: Added `STATUS_MESSAGES` map and `handle()` helper to produce human-readable messages (`"Endpoint not found (404)"` etc.).  
**Files changed**: `src/store/feedStore.js`  

### FIX-07: `PredictionHistoryTable` crashes when predictions prop is null
**Severity**: Medium  
**Root cause**: `predictions = []` default was bypassed when caller passed an explicit `null` prop.  
**Fix**: Added `Array.isArray(predictions) ? predictions : []` guard in component body.  
**Files changed**: `src/components/PredictionHistoryTable.jsx`  

### FIX-08: Provider credential inconsistency (Credentials tab vs Diagnostics panel)
**Severity**: Medium  
**Root cause**: `loadFeedStatus()` populated `feedStatus.statuses[provider].status = 'missing_credentials'` but this was never synced back to `providerCredentialsStatus`, which was only updated by `loadProviders()`. The two panels reading different state keys showed contradictory values.  
**Fix**: In `loadFeedStatus()`, after normalizing feed status, extract any provider with `status === 'missing_credentials'` and merge into `providerCredentialsStatus`. Also propagates explicit `credentialsStatus` fields from feed entries.  
**Files changed**: `src/store/feedStore.js`  

### FIX-09: `d.toFixed is not a function` crash (Phase 2 — 5 more components)
**Severity**: Critical  
**Root cause**: Same root cause as FIX-05. Additional locations found across `PredictionHistoryTable`, `ModelCardViewer`, `ModelHealthCard`, `MLDiagnosticsPanel`, and `ExecutionBlotter`.  
**Specific fix for `ExecutionBlotter`**: `fill.slippage.toFixed(4)` had no null guard at all — replaced with `fill.slippage != null ? Number(fill.slippage).toFixed(4) : '—'`.  
**Files changed**: `src/components/PredictionHistoryTable.jsx`, `src/components/ModelCardViewer.jsx`, `src/components/ModelHealthCard.jsx`, `src/components/MLDiagnosticsPanel.jsx`, `src/components/ExecutionBlotter.jsx`  

### FIX-10: Vitest "No test suite found" for ML custom-harness tests
**Severity**: Low  
**Root cause**: Three ML test files in `server-deliverables/ml/__tests__/` use a hand-rolled `test()` / `assert()` harness meant to be run with `node`, not Vitest. Vitest found them via glob and reported "No test suite found" failures.  
**Fix**: Added `exclude` pattern `server-deliverables/ml/__tests__/**` to `vite.config.js` test section.  
**Files changed**: `vite.config.js`  
**Note**: Run those tests manually: `node server-deliverables/ml/__tests__/featureService.test.js`

### FIX-11: Architecture documentation
**Severity**: N/A (documentation)  
**Files created**: `GLOBAL_PLATFORM_AUDIT.md`  

---

## DEFINITION OF DONE — STATUS

| Criterion | Status |
|-----------|--------|
| All 46 Vitest tests pass | ✅ PASS |
| No `d.toFixed is not a function` crash in tracked components | ✅ Fixed (10 components) |
| Portfolio workspace renders without crash when all endpoints 404 | ✅ Verified by tests |
| WebSocket uses `wss://` when app served over HTTPS | ✅ Fixed |
| ML endpoints return 200 + stable empty shape (not 404) | ✅ Fixed |
| ErrorBoundary shows error message + recovery buttons | ✅ Fixed |
| Raw "HTTP 404" never shown to users | ✅ Fixed |
| Provider Credentials tab and Diagnostics panel are consistent | ✅ Fixed |
| Vitest test run is clean (no spurious failures) | ✅ Fixed |
| Architecture documented in `GLOBAL_PLATFORM_AUDIT.md` | ✅ Done |

---

## WHAT COULD NOT BE FIXED IN THIS REPO

The following issues require the **separate reversal backend** (not available in this environment):

| Issue | Blocker |
|-------|---------|
| Provider API keys (save/delete credentials) | Routes `/api/feeds/providers/:p/credentials` are in the reversal backend |
| Feed status (charts, ticker, candles) | Routes `/api/feeds/*` are in the reversal backend |
| Authentication (`/auth/login`, `/auth/register`) | Routes in the reversal backend |
| Alerts (`/api/alerts/*`) | Routes in the reversal backend |
| Strategy lab, backtest, rules | Routes in the reversal backend |
| Order execution (`/api/execution/*`, `/api/oms/*`) | Routes in the reversal backend |
| Volume profile, chart overlays, footprint | Routes in the reversal backend |

The frontend handles all these 404s gracefully (empty state, user-readable error messages). The only full fix requires both backends deployed behind the same API base URL.

---

## TEST SUMMARY

```
Test Files  3 passed (3)
      Tests  46 passed (46)
   Duration  ~2s
```

**Test files**:
- `src/test/productionStability.test.jsx` — 25 tests (API errors, Portfolio 404s, ML store, ErrorBoundary)
- `src/test/symbolInput.test.jsx` — 10 tests
- `src/test/terminalShell.test.jsx` — 11 tests

**Excluded** (custom node harness, not Vitest): `server-deliverables/ml/__tests__/`

---

## COMMIT HISTORY (this branch)

| Hash | Message |
|------|---------|
| `2726280` | fix(crash): guard all .toFixed() calls against non-number API values |
| `f38d186` | fix(frontend): stabilize production API contracts, websocket and crash handling |
| `fa594fb` | fix: global audit stabilization and production hardening |
