# Frontend Full Stabilization Report

Full-platform functional stabilization pass across all workspaces. **No layout,
sidebar, panel, spacing, color, typography, terminal-shell, or mobile-layout
changes** — only functional state/API/crash fixes.

## 1. Executive Summary

The platform was audited workspace-by-workspace (ML, data/providers, macro,
portfolio/risk/backtest, and cross-cutting storage/error/WS infrastructure) for
the 16 functional bug categories in the mission. Much of the contract layer was
already hardened by prior passes (central `apiRequest` client with HTML/empty/JSON
handling, `stripUndefinedDeep`, dataset-id propagation, ML `dataset_missing` fix).

This pass found and fixed the remaining **real, verified** defects and skipped
the speculative findings that did not hold up against the source (e.g. inference
already null-guards and never fakes NEUTRAL; drift table already null-guards;
`runBacktest` already strips undefined `datasetId`).

**Result:** 180/180 tests pass, production build clean, 13/13 functional smoke
checks pass.

## 2. Workspaces Audited

All 28 menus/modules in `FRONTEND_FULL_INVENTORY.md` were reviewed. Four had
genuine functional bugs (AI Lab promote/compare endpoints, Replay NaN, app-wide
crash blast radius, WebSocket infinite reconnect). The rest were already correct.

## 3. API Calls Fixed

- **Promote → champion** now POSTs the canonical `/api/ml/promote/:modelId`
  (was the dead `/api/ai/models/:id/champion`, which 404'd — promote never worked).
- **Feature importance** now resolves to `/api/ml/feature-importance`; the dead
  shadowed duplicate pointing at `/api/ai/models/:id/importance` was removed.
- **Model comparison** (`/api/ai/models/compare`, no backend route) no longer
  calls a dead endpoint — it fails fast with a clear, honest message instead of a
  misleading "Endpoint not available" 404.
- **Dead `getMLModel`** (`/api/ai/models/:id`, no callers) removed.

## 4. Historical Data Fixes

No new changes required — symbols are parsed to a trimmed/uppercased/de-duped
array, `datasetId` is displayed after download and propagated via the persisted
store, and file diagnostics gate the action buttons (prior pass). Verified intact.

## 5. Dataset Propagation Fixes

No new changes required — `getDatasetId`, `useDatasetForMl/Backtest/Correlation`,
and the bootstrap-on-mount pattern (both AI Lab and ML Dashboard read the
persisted `selectedMlDatasetId`) are in place from the prior pass. The backtest
client already conditionally includes `datasetId` and asserts no `undefined`.

## 6. ML Lifecycle Fixes

- Promote now works end-to-end and refreshes champion + registry afterward.
- Inference (`InferenceDisplay`) and drift (`DriftTable`) confirmed to null-guard
  and **never** render a fake NEUTRAL/0% — they show explicit empty/error states.
- `trainModel` clears `trainError` at the start of every run (no stale errors).

## 7. Backtesting Fixes

Verified safe: `api.runBacktest` builds the payload through `stripUndefinedDeep` +
`assertNoUndefinedDeep`, so `datasetId` is included only when truthy and is never
sent as `undefined`. Endpoint is the canonical `POST /api/backtest/run`.

## 8. Correlation / Beta Fixes

Verified safe: `MacroWorkspace` formats beta/R² through finite-guarded helpers
("—" for null/non-finite), and `getMultiAssetBeta/Correlation` only attach
`datasetId` when present. Backend path is the real `/api/multi-asset/*`.

## 9. Provider State Fixes

Backend health remains the source of truth; localStorage is cache only. No change
needed beyond what the provider state service already enforces (covered by
`providerStateService.test.js` / `providerFrontendFlow.test.jsx`).

## 10. Live Data Fixes

Stream status already distinguishes connected/delayed/idle/disabled/missing states
via `marketRuntimeStore`/`feedStore`. No functional change required.

## 11. Portfolio / Risk Fixes

Empty states already correct ("No open positions", null VaR/ES → "—"). No change.

## 12. localStorage / Zustand Hardening

All persisted stores use Zustand persist or try/catch-guarded `JSON.parse`; no
unguarded parse in hot paths. App-level `ErrorBoundary._reset()` clears the
crash-prone keys. Documented in the inventory; no code change required.

## 13. Error Boundary Fixes

- `ErrorBoundary` now accepts an optional **`fallback`** prop (render-prop or
  node). Existing app-level usage is unchanged (still the full-screen page).
- `WorkspaceRenderer` now wraps the active workspace in a **scoped, keyed**
  `ErrorBoundary` with a compact inline fallback. A crash in one workspace shows
  an inline "This workspace hit an error / Retry" card **without blanking the
  sidebar, top bar, or status bar**, and navigating to another workspace
  (`key={workspace}`) remounts cleanly. This satisfies "no single workspace crash
  crashes the whole app."

## 14. WebSocket Fixes

`wsClient` now caps reconnects at `maxReconnectAttempts` (12). After the cap it
stops the silent infinite retry loop, sets `unavailable = true`, and keeps the app
on REST fallback. A new `reconnectNow()` resumes on demand. `unavailable` resets
to `false` on a successful open.

## 15. Tests Added

`src/test/frontendStabilization.test.jsx` (11 tests):
- `setChampionModel` POSTs `/api/ml/promote/:modelId`, not `/api/ai/*`
- `getMLFeatureImportance` GETs `/api/ml/feature-importance`
- `compareMLModels` rejects with a clear message and makes no network call
- dead `getMLModel` removed from the client
- `aiLabStore.promoteToChampion` hits promote then reloads champion + registry
- `promoteToChampion()` with no id sends nothing (never `undefined`)
- `ErrorBoundary` renders children when healthy; renders scoped fallback on crash;
  falls back to full-screen page without a fallback prop; reset re-renders children
- `wsClient` exposes `maxReconnectAttempts` + `reconnectNow()` and resets cleanly

Full suite: **180 passed (17 files)**.

## 16. Functional Smoke

`scripts/frontend-functional-smoke.js` (`npm run frontend:smoke`) → 13/13 checks,
writes `FRONTEND_FUNCTIONAL_SMOKE_RESULTS.json`. Guards: canonical ML endpoints,
no dead `/api/ai/models/*`, undefined-datasetId stripping, NaN-safe render guards,
scoped error boundary, bounded WS reconnect, guarded localStorage parse.

## 17. Build Results

| Command | Result |
|---------|--------|
| `npm test` | ✅ 180 passed |
| `npm run build` | ✅ built (pre-existing chunk-size + dynamic-import warnings only) |
| `npm run frontend:build` | ✅ (alias of build) |
| `npm run frontend:smoke` | ✅ 13/13 |
| `npm run lint` | ⚠️ not configured in this repo |
| `npm run typecheck` | ⚠️ not configured (JS/JSX project, no TS) |

## 18. Remaining Risks / Manual Checks

- **Model comparison** has no backend route; the UI degrades to a clear "not
  available" message rather than calling a dead endpoint. If comparison is wanted,
  add a `/api/ml/compare` backend route (or compute client-side from registry
  metrics) — out of scope for a no-design functional pass.
- **No schema versioning** on the three Zustand persist stores. Low risk (UI-only
  caches, guarded reset), but a `version` + migration is a future improvement.
- Manual smoke recommended against a live backend: Historical download → Use for
  ML → AI Lab shows datasetId → Train sends datasetId → Promote → Champion loads →
  Run inference (no endpoint_not_found) → Backtest/Correlation use datasetId →
  Beta never NaN → fallback_demo stays disabled after refresh → force a workspace
  render error and confirm the shell stays alive.
