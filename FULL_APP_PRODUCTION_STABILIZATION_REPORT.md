# Full App Production Stabilization Report

## 1. Executive summary

This stabilization pass fixed the remaining cross-workspace contract risks that were most likely to produce the user's observed production/mobile bugs: stale/missing Historical use-for endpoints, non-persisted dataset selections, NaN beta/correlation rendering, backend `/api/*` HTML fallback risk, missing canonical route aliases, and lifecycle drift between AI Lab and ML Dashboard. The pass also added class-level smoke scripts that fail on stale ML endpoints, inaccessible mobile workspaces, undefined dataset payloads, non-JSON backend API responses, NaN/Infinity JSON, and uncapped WebSocket behavior.

## 2. Why previous audits missed remaining bugs

Previous reports and tests covered many visible symptoms, but several gaps remained:

1. Dataset selection was stored in multiple non-persisted stores, so navigation-only tests passed while refresh/mobile remounts lost `selectedMlDatasetId`.
2. The frontend had helpers for selected datasets, but the backend did not expose the canonical `/api/historical/use-for-*` contract.
3. The backend mounted many routes but lacked a final JSON-only `/api/*` 404/error contract, so unknown API paths could fall back to Express HTML.
4. Macro calculations were partly sanitized server-side, but UI formatting still trusted `beta != null` and matrix cell values even when they were non-finite strings/numbers.
5. Workspace accessibility was implied by menu components rather than smoke-tested against one canonical registry.
6. WebSocket retry capping existed, but listener cleanup and smoke coverage were incomplete.

## 3. Full workspace inventory

See `FULL_APP_BUG_INVENTORY.md` for the complete workspace matrix. The key result is that `src/config/workspaces.js` remains the single registry for desktop sidebar, mobile bottom nav, mobile More menu, active workspace validation, and smoke tests. All implemented desktop workspaces are asserted to be present in the mobile primary or More menus by `scripts/full-frontend-smoke.js`.

## 4. Full API contract inventory

See `FULL_APP_BUG_INVENTORY.md` for the complete API matrix. The critical canonical route changes are:

- Added backend and frontend contract support for `POST /api/historical/use-for-ml`.
- Added backend and frontend contract support for `POST /api/historical/use-for-backtest`.
- Added backend and frontend contract support for `POST /api/historical/use-for-correlation`.
- Added `GET /api/ml/dependencies`.
- Added `GET /api/backtest/runs` and `GET /api/backtest/runs/:runId`.
- Added `GET /api/macro/volatility-heatmap` alias.
- Added JSON-only `/api/*` unknown route and error middleware.

## 5. Duplicated/stale components found

AI Lab and ML Dashboard still have separate stores/components, but they now use the same canonical ML routes:

- Champion: `GET /api/ml/model`.
- Runs: `GET /api/ml/model-runs`.
- Promote: `POST /api/ml/promote/:modelId`.
- Inference: `POST /api/ml/infer/:symbol`.
- Feature importance: `GET /api/ml/feature-importance`.
- Drift: `GET /api/ml/drift`.

The full frontend smoke rejects stale `/api/ml/champion` and `/api/ai/models/*` lifecycle strings in production source.

## 6. Stale endpoints removed/guarded

- No production source uses `/api/ml/champion`.
- No production source uses `/api/ai/models/*` for ML lifecycle.
- Model comparison remains a deliberate client-side unavailable operation instead of calling a dead endpoint.
- Canonical smoke now fails if stale ML champion/model lifecycle paths return.

## 7. Dataset flow fixes

- Historical store is now persisted with versioned safe storage under `reversal-historical-selection-v2`.
- Persisted fields include `selectedDatasetId`, `selectedMlDatasetId`, `selectedBacktestDatasetId`, and `selectedCorrelationDatasetId` plus normalized dataset objects.
- Historical Data use-for actions synchronously update local state for navigation responsiveness and call the backend canonical use-for endpoint in the background.
- Historical Data dispatches events with a real `datasetId` and normalized dataset payload.
- AI Lab, ML Dashboard, and Macro bootstrap selected datasets from `historicalDataStore` after navigation/remount.

## 8. ML lifecycle fixes

- Added `/api/ml/dependencies` safe JSON route.
- AI Lab and ML Dashboard use `/api/ml/model` for champion model state.
- Promote paths use `/api/ml/promote/:modelId`.
- Inference paths use `/api/ml/infer/:symbol`.
- Training payloads continue to include `datasetId` when a selected dataset exists.
- Smoke coverage rejects stale ML lifecycle endpoints and checks canonical route presence.

## 9. Python training fixes

- Removed `multi_class="multinomial"` from the sklearn `LogisticRegression` baseline constructor.
- Isolated Logistic Regression baseline failure from champion model training: baseline exceptions now log a warning and do not block candidate/champion training.
- Baseline metrics/artifact emission is conditional on successful baseline training.

## 10. Backtesting fixes

- Added canonical `GET /api/backtest/runs` and `GET /api/backtest/runs/:runId` routes.
- Existing `POST /api/backtest/run` continues to require a selected historical `datasetId` and returns structured `dataset_missing`, `dataset_not_found`, `dataset_file_missing`, or `not_enough_data` JSON.
- Frontend backtest payload guard keeps `datasetId` out when missing and prevents undefined values.

## 11. Macro/Beta fixes

- Macro UI now uses `finiteNumber()` for beta, R², and correlation matrix cells.
- Invalid beta/R² renders `—`.
- Beta interpretation only renders when beta is finite.
- Correlation matrix cells render `—` for invalid values and title them as `not enough data`.
- Macro bootstraps the persisted correlation dataset from Historical Data and refreshes analytics with it.
- Backend exposes `/api/macro/volatility-heatmap` as the canonical alias for the existing volatility route.

## 12. Provider fixes

Provider routes were already mounted through the provider router. The new backend smoke verifies:

- `/api/providers/health`
- `/api/providers/credentials`
- `/api/providers/active`
- `/api/feed/status`
- `/api/feeds/tick/:symbol`
- `/api/feeds/candle/:symbol`
- `/api/feeds/orderbook/:symbol`

Provider truth remains backend-driven; no fake market data or fake connectivity was added.

## 13. Portfolio/Risk fixes

No UI redesign was made. The backend smoke now verifies all required safe empty JSON routes:

- Portfolio summary, positions, PnL, exposure, drawdown, history.
- Risk summary, limits, VaR, drawdown, exposure, alerts.

## 14. Mobile navigation fixes

The canonical workspace registry remains the single source for desktop and mobile. `scripts/full-frontend-smoke.js` checks every implemented desktop workspace is mobile-accessible and every implemented workspace has a component mapping.

## 15. localStorage/Zustand fixes

- Historical dataset selection is persisted with safe storage/versioned merge.
- Terminal layout store now uses safe JSON storage, versioning, and validated merge defaults.
- Watchlist store now uses safe JSON storage, versioning, and normalized/deduped symbols on merge.
- Existing workspace store validation remains in place for stale active workspace IDs.

## 16. Error boundary fixes

Existing scoped ErrorBoundary coverage was preserved and is asserted by smoke/tests. Workspace crashes remain isolated by the keyed workspace boundary in `App.jsx`; panel crash behavior is covered by existing tests.

## 17. WebSocket fixes

`wsClient` already had capped reconnect and manual `reconnectNow()`. This pass added unsubscribe cleanup return functions for `onMessage`, `onConnect`, and `onDisconnect`, plus an explicit `close()` cleanup method. The frontend smoke verifies capped reconnect, manual reconnect, and listener cleanup.

## 18. Backend tests added/updated

- Added `scripts/full-backend-smoke.js` to exercise required backend contract categories.
- Existing Vitest backend-route tests pass.
- Existing Python tests pass.

## 19. Frontend tests added/updated

- Added `scripts/full-frontend-smoke.js` for stale endpoint, workspace/mobile accessibility, dataset payload, Macro NaN, persistence, ErrorBoundary, and WebSocket invariants.
- Existing Vitest frontend tests pass.

## 20. Smoke results

- `FULL_FRONTEND_SMOKE_RESULTS.json`: 11/11 checks passed.
- `FULL_BACKEND_SMOKE_RESULTS.json`: 40/40 checks passed.
- `FULL_PLATFORM_CONTRACT_SMOKE_RESULTS.json`: frontend and backend contract smokes passed.

## 21. Build results

- `npm run build`: passed. Vite emitted pre-existing chunk-size/dynamic-import warnings, not functional failures.
- `npm run frontend:build`: passed. Same Vite warnings.

## 22. Remaining risks

- Production credentials and deployed Render environment cannot be modified from this workspace. Provider availability still depends on real saved credentials and external provider limits.
- `npm run lint` and `npm run typecheck` are not available in `package.json`; both commands fail because scripts are missing, not because of code errors.
- The backend-specific sibling repo named `reversal` was not present as a separate Git repository under `/workspace`; this repo contains the mounted backend/server-deliverables code used by the app.
- Backend smoke validates route contracts locally; it does not verify the live production deployment unless `FULL_BACKEND_SMOKE_BASE` is pointed at production.

## 23. Manual checks

Automated evidence covers the manual checklist categories that can be checked in this environment:

1. Mobile menu accessibility: checked by full frontend smoke.
2. Dataset ID propagation/persistence: checked by Vitest dataset tests and full frontend smoke.
3. ML canonical champion/promote/inference routes: checked by Vitest and full frontend/backend smoke.
4. Backtest/correlation dataset guards: checked by Vitest and full frontend smoke.
5. Beta never renders NaN: checked by Macro finite guards and smoke.
6. Portfolio/risk safe empty state routes: checked by full backend smoke.
7. Provider JSON route consistency: checked by full backend smoke.
8. WebSocket failure non-blocking/capped: checked by full frontend smoke.
9. Corrupt storage recovery: covered by safe storage merges and existing tests.

## 24. Deployment notes

- Frontend API base still defaults to `https://reversal.onrender.com` when the frontend is hosted on Render and no `VITE_API_BASE` is provided.
- For local development, the API base remains `http://localhost:10000` unless overridden by `VITE_API_BASE`.
- To verify production after deploy, run:
  - `FULL_BACKEND_SMOKE_BASE=https://reversal.onrender.com node scripts/full-backend-smoke.js`
  - `node scripts/full-frontend-smoke.js`
