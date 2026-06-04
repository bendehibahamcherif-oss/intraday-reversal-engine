# Provider Credentials and Selection Fix

## 1. Root cause

Production had duplicate and contradictory provider state flows. The frontend read credential status, active provider lists, feed status, and runtime status from different payload shapes and then merged them with stale local state. In particular, `selectedProviders` could contain `alphaVantage` while backend-derived `activeProviders` did not, and local state preservation logic could keep stale `fallback_demo` state after the backend had responded. On the backend side, there was no single canonical provider-state contract for credentials, provider health, active provider selection, and feed status.

## 2. Duplicate states found

- Credential status was inferred from provider catalog/status fields instead of one masked credential endpoint.
- Active providers were derived from multiple fields (`providers`, `providerOrder`, `enabledByProvider`, and frontend-selected state), causing backend/UI divergence.
- Feed status and provider diagnostics used different status names, which allowed `credentialStatus=configured` and `runtimeStatus=missing_credentials` to appear together.
- Provider checkbox state was immediately mixed with backend saved state, so a draft change could look saved before `POST /api/providers/active` succeeded.

## 3. Backend files changed

- `server/providerStateService.cjs`
  - Added the canonical provider state service.
  - Added masked credential persistence and credential resolution.
  - Added provider health, active provider selection, and feed status response builders.
  - Added canonical `/api/providers/*` routes plus legacy `/api/feeds/*` compatibility routes.
- `server/index.cjs`
  - Registers the provider state router under `/api`.
- `server-deliverables/api/multiAssetRoutes.js`
  - Fixed the server smoke startup import path for `historicalStore`.

## 4. Frontend files changed

- `src/api.js`
  - Routes provider credentials, health, active provider saves, and feed status to canonical backend endpoints.
- `src/store/feedStore.js`
  - Treats backend `activeProviders` as saved truth.
  - Keeps checkbox changes in `selectedProviders` as a dirty draft until Save.
  - Re-fetches credentials, provider health, and feed status after credential saves/deletes.
  - Re-fetches provider health and feed status after active provider saves.
  - Prevents stale local/cache state from overriding backend state once backend responds.
- `src/workspaces/LiveDataWorkspace.jsx`
  - Shows backend active providers, provider order, draft selected providers, dirty state, save timestamp, and save errors.
  - Shows credential source and masked value from the canonical credential endpoint.
- `src/components/ProviderDiagnosticsPanel.jsx`
  - Renders canonical provider objects consistently.
  - Filters contradictory credential warnings when a provider is configured.
- `vite.config.js`
  - Excludes legacy console-only ML scripts from Vitest discovery so `npm test` runs actual Vitest suites only.

## 5. Endpoint contracts fixed

- `GET /api/providers/credentials`
  - Returns masked credential status only.
  - Never returns full API keys.
- `POST /api/providers/credentials/:providerId`
  - Validates provider and non-empty `apiKey`.
  - Stores backend-side credential.
  - Returns canonical provider state plus masked credential metadata.
- `DELETE /api/providers/credentials/:providerId`
  - Deletes backend credential and recomputes provider state.
- `GET /api/providers/health`
  - Returns canonical provider objects, active providers, provider order, source, and warnings.
- `POST /api/providers/active`
  - Validates, deduplicates, preserves order, rejects unknown providers, and rejects credential-required providers without credentials.
- `GET /api/feed/status`
  - Returns provider health-consistent feed status.

Legacy `/api/feeds/status`, `/api/feeds/providers`, `/api/feeds/providers/active`, and `/api/feeds/providers/:providerId/credentials` remain as compatibility aliases backed by the same canonical service.

## 6. Credentials persistence fix

Credential resolution priority is now:

1. Backend-saved credential.
2. Environment variable.
3. Missing.

The backend stores credentials in the provider state file (`PROVIDER_STATE_FILE` or `data/provider-state.json`) and only returns masked values. Alpha Vantage with a saved key or env var now returns `credentialStatus: configured`; its runtime status is `delayed`, not `missing_credentials`.

## 7. Active provider persistence fix

`POST /api/providers/active` persists the deduplicated ordered provider list. Frontend Save sends the draft list, then re-fetches backend provider health and feed status before marking the draft clean. After refresh, `selectedProviders` initializes from backend `activeProviders`.

## 8. `fallback_demo` behavior fix

`fallback_demo` is now optional. It is not silently re-added when the user saves `yahoo` or `yahoo + alphaVantage`. It remains active only when explicitly selected or when credential deletion leaves no usable provider and the backend must adjust state.

## 9. Tests added

Backend/provider service tests cover:

1. Saving Alpha Vantage credentials returns configured.
2. Credential responses are masked and never include the full key.
3. Provider health reports Alpha Vantage configured after save.
4. Configured Alpha Vantage never reports `missing_credentials`.
5. Deleting credentials changes credential status to missing.
6. Saving yahoo only persists `['yahoo']`.
7. Saving yahoo + Alpha Vantage persists both in order.
8. `fallback_demo` is not re-added when yahoo is active.
9. Selecting Alpha Vantage without credentials is rejected.
10. Feed status active providers match provider health active providers.
11. Alpha Vantage env var counts as configured.
12. Unknown providers are rejected.

Frontend tests cover:

1. Draft provider state initializes from backend active providers.
2. Stale localStorage provider selection does not override backend active providers.
3. Checkbox toggles update draft only.
4. Removing `fallback_demo` and saving re-fetches backend/feed truth.
5. Diagnostics show configured Alpha Vantage without missing credential warnings.
6. Save errors remain visible and keep dirty state.
7. Credential save re-fetches credentials, provider health, and feed status.

## 10. Validation results

- `npm test` — passed.
- `npm run build` — passed with existing Vite chunk-size/dynamic-import warnings.
- `npm run frontend:build` — passed with existing Vite chunk-size/dynamic-import warnings.
- `npm run lint` — failed because no `lint` script exists in `package.json`.
- `npm run typecheck` — failed because no `typecheck` script exists in `package.json`.
- `npm run server:smoke` — passed after fixing the historical store import path.

## 11. Remaining risks

- File-based credential persistence depends on `PROVIDER_STATE_FILE` or the runtime filesystem. If the production platform uses ephemeral storage, credentials should be moved to a durable secret store or database collection using this same service contract.
- IBKR gateway health remains environment-driven (`IBKR_GATEWAY_CONNECTED=true`) and should be connected to a real gateway health probe when available.
- The legacy `/api/feeds/*` aliases are retained for compatibility; future cleanup can remove them after all clients use `/api/providers/*` and `/api/feed/status`.
