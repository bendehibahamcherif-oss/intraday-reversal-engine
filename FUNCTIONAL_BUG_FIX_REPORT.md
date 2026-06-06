# Functional Bug Fix Report — ML Endpoints and Provider Persistence

## 1. Root causes

| Area | Root cause | Impact |
|---|---|---|
| ML empty states | Several ML routes returned legacy/raw shapes, arrays, or no-model responses that were not normalized to the frontend contract. | Valid empty states could be interpreted as missing/broken endpoints and surfaced as `Endpoint not available` or generic errors. |
| ML inference no champion | `POST /api/ml/infer/:symbol` only evaluated worker/feature-vector paths and did not provide the required no-champion contract. | A deployment with no promoted model could show an endpoint/inference error instead of a no-champion state. |
| Provider persistence | Provider state needed one canonical saved source-of-truth and structured validation for empty selections. | `fallback_demo` could appear as a silent fallback instead of staying inactive when a viable provider such as Yahoo remained selected. |
| Live Data status | Yahoo delayed REST data was represented with websocket-style connection semantics. | Yahoo could appear as `NOT CONNECTED` even while it was the selected delayed data source. |
| Feed API coverage | Frontend calls `/api/feeds/tick/:symbol`, `/api/feeds/candle/:symbol`, and `/api/feeds/orderbook/:symbol`; backend only exposed status/provider endpoints. | Raw HTTP route errors could appear in Live Data for routes that should have existed. |
| Runtime hydration | The market runtime store did not consume array-shaped provider health payloads as canonical provider health/runtime state. | Runtime panels could lag behind backend `activeProviders` and show contradictory provider state. |

## 2. ML endpoint fixes

### Backend route audit

| Route | Status after fix | Notes |
|---|---:|---|
| `GET /api/ml/health` | Present | Mounted via `app.use('/api/ml', mlRoutes)`. |
| `GET /api/ml/model` | Present / hardened | Returns `200` with `{ ok: true, champion: null, challengers: [], status: 'no_model' }` when no champion exists. |
| `GET /api/ml/model-runs` | Present / hardened | Returns `200` with `{ ok: true, runs: [] }` for an empty registry. |
| `GET /api/ml/predictions` | Present / hardened | Returns `200` with `{ ok: true, predictions: [] }`. |
| `GET /api/ml/feature-importance` | Present / hardened | Returns `200` with `{ ok: true, features: [] }` when no feature importance exists. |
| `GET /api/ml/drift` | Present / hardened | Returns `200` with `not_enough_data` empty drift shape. |
| `GET /api/ml/model-card` | Present / hardened | Returns `200` with `{ ok: true, modelCard: null, status: 'not_available' }` when unavailable. |
| `POST /api/ml/infer/:symbol` | Present / hardened | Returns `200` with `ok:false`, `status:'no_champion_model'` when no champion exists. |
| `POST /api/ml/train` | Present | Existing route retained. |

### Frontend ML API audit

| Component/store | Endpoint called | Backend route exists? | Previous risk | Fix |
|---|---|---:|---|---|
| `MLDashboard` initial diagnostics | `GET /api/ml/metrics` | Yes | Diagnostics errors were not explicitly passed into the panel and empty route contracts were inconsistent. | Passed diagnostics error explicitly and preserved empty diagnostics handling. |
| `TrainingRunsPanel` / model registry state | `GET /api/ml/model-runs` | Yes | Empty registry could return a raw array/legacy shape. | Backend now returns `{ ok, runs }`; store still normalizes legacy arrays. |
| `ModelHealthCard` | `GET /api/ml/model`, `GET /api/ml/health` | Yes | No champion could be represented as a false/error-ish no-champion shape. | Backend returns canonical `no_model`; store unwraps champion payloads without throwing. |
| `DriftDashboard` | `GET /api/ml/drift` | Yes | Empty drift could be legacy `unknown` shape. | Backend returns `{ ok, drift: { status:'not_enough_data', ... } }`; store unwraps `drift`. |
| `FeatureImportanceTable` | `GET /api/ml/feature-importance` | Yes | Empty features lacked `ok` contract. | Backend returns `{ ok:true, features:[] }`. |
| `ModelCardViewer` | `GET /api/ml/model-card` | Yes | Missing model card could look like an unavailable route. | Backend returns `modelCard:null`; store unwraps valid model cards. |
| Live inference | `POST /api/ml/infer/:symbol` | Yes | No champion could become a generic inference failure. | Backend returns canonical `no_champion_model` response. |

## 3. Provider selection fixes

- `POST /api/providers/active` now rejects empty selections with a structured `NO_PROVIDER_SELECTED` validation code instead of silently selecting a provider.
- Saving `['yahoo']` persists exactly `activeProviders: ['yahoo']` and `providerOrder: ['yahoo']`.
- Saving `['yahoo', 'alphaVantage']` persists order when Alpha Vantage credentials are configured.
- Frontend provider draft selection remains separate from backend saved `activeProviders`; after save the frontend re-fetches both provider health and feed status.

## 4. `fallback_demo` persistence fix

- `fallback_demo` is not silently re-added when at least one viable provider remains selected.
- `fallback_demo` warning text is only returned when `fallback_demo` is actually active.
- Feed orderbook empty-state responses no longer pretend `fallback_demo` is active unless backend `activeProviders` includes it.

## 5. LiveData status consistency fix

- Yahoo now reports canonical delayed REST semantics:
  - `runtimeStatus: 'delayed'`
  - `credentialStatus: 'not_required'`
  - `sourceType: 'delayed'`
  - `connected: false` because Yahoo delayed REST is not a websocket/live institutional feed.
- Frontend Live Data status labels display `DELAYED (yahoo)` rather than `NOT CONNECTED (yahoo)` when runtime status is delayed.
- Runtime hydration now consumes array-shaped provider health payloads and syncs `activeProviders`, `providerOrder`, primary source, and provider warnings from backend health.

## 6. Files changed

| File | Purpose |
|---|---|
| `server-deliverables/ai/mlRoutes.js` | Hardened ML route contracts and no-champion/no-data responses. |
| `server/providerStateService.cjs` | Hardened provider persistence, structured validation, Yahoo/fallback status contracts, and feed data empty-state routes. |
| `src/store/mlStore.js` | Unwrapped canonical ML `drift`, `modelCard`, and `champion` response shapes. |
| `src/store/feedStore.js` | Preserved backend provider truth, normalized delayed runtime status, and handled valid empty tick/candle/orderbook payloads. |
| `src/store/marketRuntimeStore.js` | Hydrated runtime state from provider health array payloads. |
| `src/workspaces/LiveDataWorkspace.jsx` | Exported and used existing status label logic to show delayed status correctly; no layout changes. |
| `src/workspaces/MLDashboard.jsx` | Passed diagnostics errors into the diagnostics panel; no layout changes. |
| `src/test/mlBackendRoutes.test.js` | Added backend ML route contract tests. |
| `src/test/providerStateService.test.js` | Added provider empty-selection and Yahoo delayed contract tests. |
| `src/test/providerFrontendFlow.test.jsx` | Added frontend delayed status-label coverage. |

## 7. Tests added/updated

- Added backend ML empty-state route tests for:
  - `GET /api/ml/drift`
  - `GET /api/ml/model-runs`
  - `GET /api/ml/model`
  - `POST /api/ml/infer/:symbol`
- Updated provider state tests for:
  - Yahoo-only persistence without `fallback_demo`
  - Yahoo delayed runtime contract
  - empty provider selection validation
  - feed status `activeProviders` matching provider health
- Updated frontend tests for:
  - stale localStorage not overriding backend provider state
  - `fallback_demo` draft uncheck staying separate from saved state until save
  - save flow re-fetching provider health/feed status
  - Yahoo delayed status showing `DELAYED`, not `NOT CONNECTED`

## 8. Validation results

| Command | Result | Notes |
|---|---:|---|
| `npm run build` | Pass | Vite build completed; existing chunk-size/dynamic-import warnings only. |
| `npm run frontend:build` | Pass | Vite build completed; existing chunk-size/dynamic-import warnings only. |
| `npm test` | Pass | 7 files / 79 tests passed; existing intentional ErrorBoundary test logs appear in output. |
| `npm run lint` | Not available | Root package has no `lint` script. |
| `npm run typecheck` | Not available | Root package has no `typecheck` script. |
| `npm --prefix server test` | Not available | `server/package.json` has no `test` script. |
| `npm run server:smoke` | Pass | Smoke checks passed. |
| `npm --prefix server run build` | Not available | `server/package.json` has no `build` script. |

## 9. Remaining risks

- There is no separate backend repository checkout named `reversal` in this workspace; backend code lives under `server/` and `server-deliverables/` in this repo.
- Real provider connectivity beyond delayed Yahoo/demo empty states still depends on external credentials and upstream provider availability.
- `npm test` emits existing console error output from intentional ErrorBoundary crash tests, but the test suite exits successfully.
- Root project currently has no lint/typecheck scripts, so static lint/typecheck validation could not be performed.
