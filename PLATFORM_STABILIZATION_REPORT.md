# Platform Stabilization Report

## 1. Executive summary

The stabilization pass converted the visible ML, provider, live-data, portfolio, and risk failures into explicit mounted API contracts with safe empty states. Required smoke endpoints now return JSON and avoid HTTP 404. The backend remains the provider source of truth; frontend localStorage is treated as a draft/cache and does not override backend provider responses.

## 2. Functional matrix summary

See `PLATFORM_FUNCTIONAL_MATRIX.md` for workspace-by-workspace dependencies. Required workspaces are covered with either a mounted endpoint contract or `not_implemented_but_safe` when a placeholder/partial feature must not fabricate trading data.

## 3. Endpoints fixed

- ML: `/api/ml/health`, `/api/ml/model`, `/api/ml/model-runs`, `/api/ml/predictions`, `/api/ml/feature-importance`, `/api/ml/drift`, `/api/ml/model-card`, `/api/ml/infer/:symbol`.
- Providers/feed: `/api/providers/*`, `/api/feed/status`, `/api/feeds/tick/:symbol`, `/api/feeds/candle/:symbol`, `/api/feeds/orderbook/:symbol`, plus legacy feed start/stop and demo generator paths.
- Portfolio: `/api/portfolio/summary`, `/api/portfolio/positions`, `/api/portfolio/pnl`, `/api/portfolio/exposure`, `/api/portfolio/drawdown`, `/api/portfolio/history`.
- Risk: `/api/risk/summary`, `/api/risk/limits`, `/api/risk/var`, `/api/risk/drawdown`, `/api/risk/exposure`, `/api/risk/alerts`.

## 4. Backend routes added/mounted

- Added `server-deliverables/api/riskRoutes.js` and mounted it at `/api/risk`.
- Added portfolio `summary` and `history` safe empty-state routes.
- Mounted feed start/stop/demo routes without creating synthetic trading data.
- Updated ML health to return the required `available` contract even when the worker is not configured.

## 5. Frontend API paths fixed

- Added API methods for portfolio summary/history and risk endpoints.
- Added `apiRequest()` as a standard API response wrapper returning `{ ok, status, data, error, endpoint, method }` for HTTP, empty-body, invalid-JSON, network, and timeout outcomes.

## 6. ML workspace fixes

- ML health returns `ok:true`, `status:'available'`, and a worker mode such as `not_configured`.
- No champion model remains a 200 JSON empty state, not a route-missing error.
- Drift and model-card endpoints return `not_enough_data` / `not_available` empty states.

## 7. Provider credential fixes

- Alpha Vantage saved credentials are masked and treated as configured across health/diagnostics.
- A configured credentialed provider does not return `missing_credentials`.
- Selecting a credential-required provider without credentials returns a structured 400.

## 8. fallback_demo persistence fixes

- Default provider state is Yahoo only.
- Saving Yahoo only persists `activeProviders: ['yahoo']` and does not silently add `fallback_demo`.
- Saving Yahoo + Alpha Vantage preserves order and keeps `fallback_demo` inactive unless explicitly selected.

## 9. Live data status fixes

- Yahoo REST data is classified as `runtimeStatus:'delayed'`, `connected:false`, and `sourceType:'delayed'`.
- Delayed Yahoo is not represented as a broken websocket connection.
- Latest tick/candle/orderbook endpoints report source and no-data status without fake market data.

## 10. Portfolio/Risk fixes

- Portfolio and risk required routes are mounted and return zero/empty safe contracts.
- No required Portfolio/Risk smoke endpoint returns HTTP 404.

## 11. WS status handling

- Websocket remains non-blocking: the backend starts `/ws`, and the app continues to use REST contracts when market-feed credentials or realtime connectivity are unavailable.
- Existing frontend stability tests cover websocket-unavailable/no-crash behavior.

## 12. Error boundary/localStorage fixes

- Existing App/Workspace/Panel error-boundary and corrupt-localStorage tests continue to pass.
- Provider draft state remains separate from backend saved state; backend provider health refreshes override stale localStorage provider selections.

## 13. Tests added

- `src/test/platformContracts.test.js` validates ML health, portfolio, risk, safe demo-generator contracts, and the central API wrapper.
- Existing ML/provider tests were extended/kept passing for no-model, drift empty state, Alpha Vantage credential, fallback_demo persistence, and Yahoo delayed semantics.

## 14. Smoke test result

- `PLATFORM_SMOKE_RESULTS.json` shows `ok:true`, `total:22`, `passed:22`, `failed:0` for required ML/provider/live-data/portfolio/risk endpoints.

## 15. Build/test result

- Frontend build: pass with existing Vite chunk-size/dynamic-import warnings.
- Frontend test suite: pass, 8 files / 84 tests.
- Server smoke: pass.
- Platform smoke: pass, 22/22 endpoints.
- `npm run lint` and `npm run typecheck`: scripts are not defined in this package.
- `npm --prefix server test` and `npm --prefix server run build`: scripts are not defined in `server/package.json`.

## 16. Remaining risks

- Some Strategy Lab, Quant Lab, Alerts, Volume Profile, chart, auth/settings, and advanced market runtime endpoints remain deployment-dependent or partial runtime features. They are documented as `not_implemented_but_safe` where this pass did not add fake data.
- Live market feed ingestion remains disabled without `MARKET_FEED_KEY` and `MARKET_FEED_SECRET`; this is an external configuration dependency, not a UI crash.
- ML inference remains unavailable until a champion model is trained/promoted and workers are configured; the UI/API now reports `no_champion_model` instead of endpoint unavailable.

## 17. Exact manual checks still needed

1. In the deployed environment, save an Alpha Vantage key and confirm Credentials, Providers, and Diagnostics all show `configured`.
2. Uncheck `fallback_demo`, save Yahoo only, refresh the app, and confirm backend `/api/providers/active` returns only `['yahoo']`.
3. If live websockets are expected in production, configure the realtime feed/gateway credentials and confirm the status transitions from REST `DELAYED` to live connected for a realtime provider.
