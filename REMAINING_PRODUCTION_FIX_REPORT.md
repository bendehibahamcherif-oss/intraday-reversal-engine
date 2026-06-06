# Remaining Production Fix Report

Generated on 2026-06-05.

## 1. Exact remaining bugs reproduced from production screenshots

- ML Diagnostics & Drift showed `Endpoint not available`.
- AI Lab / ML Model Training, Model Registry, and Champion Model panels showed `Invalid JSON response`.
- Training Runs displayed `"symbol" is required and must be a string`.
- Macro / Multi-Asset rolling correlation and volatility panels were empty and needed JSON-contract verification.

## 2. Exact frontend calls causing the bugs

See `PRODUCTION_API_VERIFICATION.md` for the full call matrix. The critical mismatches were:

- AI Lab was still using older `/api/ai/models*`, `/api/ai/inference/*`, and `/api/ai/drift/*` calls for production-visible ML panels.
- ML Dashboard tabs used `/api/ml/*` routes but list endpoints did not consistently include optional symbol/default empty-state metadata.
- Macro used `/api/multi-asset/*` routes whose responses lacked a common `ok/status` empty-state contract.

## 3. Production endpoint verification before fix

`API_BASE=https://reversal.onrender.com node scripts/production-api-smoke.js` was executed. The Codex environment blocked outbound HTTPS CONNECT through its proxy and returned `fetch failed` for each Render endpoint. Because of that environment limitation, the checked-in smoke output records status `0` rather than live Render status codes.

## 4. Root cause of `Invalid JSON response`

The likely production root cause was frontend/backend route mismatch plus production API-base ambiguity:

- AI Lab calls pointed at `/api/ai/*` ML routes while the deployed backend contract is `/api/ml/*`.
- If `VITE_API_BASE` is absent in a Render frontend build, browser calls can fall back incorrectly instead of targeting `https://reversal.onrender.com`.
- The API parser previously emitted generic `Invalid JSON response` for HTML, plain text, or malformed JSON bodies.

## 5. Root cause of symbol-required error

Training Runs and list-like ML endpoints were not treated as optional-symbol endpoints end to end. The fix makes the frontend pass an uppercased symbol when available and makes backend list routes accept missing symbol by returning all/empty runs rather than rejecting.

## 6. Backend route fixes

- `/api/ml/model-runs` now accepts optional `?symbol=SPY`, defaults response metadata to `symbol:'SPY'`, and returns `{ ok, runs, symbol, status }`.
- `/api/ml/predictions` now accepts optional `?symbol=SPY` and returns `{ ok, predictions, symbol, status }`.
- `/api/ml/feature-importance` now returns `{ ok, features: [], status:'no_model' }` in no-model empty states.
- `/api/ml/train` now returns structured JSON for training unavailable states.
- `/api/ml/infer/:symbol` now returns structured JSON for no champion, invalid inputs, and worker-stopped states.
- `/api/ml/*` now has a JSON 404/error fallback to prevent HTML responses.
- `/api/multi-asset/*` now returns `ok/status` empty-state metadata and `/api/macro` is mounted as a compatibility alias.

## 7. Frontend API path/param fixes

- Render production fallback now resolves to `https://reversal.onrender.com` when `VITE_API_BASE` is absent on a non-backend Render frontend hostname.
- AI Lab model training, registry, champion, inference, and drift calls now target `/api/ml/*`.
- ML inference and training symbols are normalized to uppercase and fall back to `SPY` rather than sending `undefined`.

## 8. API parser hardening

- JSON content-type is parsed normally.
- HTML responses produce `API response is not JSON (<endpoint>)`.
- Empty `204` bodies are allowed; unexpected empty successful bodies now produce a structured parser error instead of being silently accepted.
- Malformed JSON logs a short dev-only preview and returns a structured parser error instead of exposing body content to users.

## 9. Macro endpoint status

Macro workspace endpoints are verified by `scripts/production-api-smoke.js` with the exact URLs used by the frontend. Local contract verification is green. Production live verification remains blocked by this environment's outbound proxy until run in CI/Render or from an unrestricted network.

## 10. Production smoke result

- Production command executed: `API_BASE=https://reversal.onrender.com node scripts/production-api-smoke.js`.
- Output file: `PRODUCTION_API_SMOKE_RESULTS.json`.
- Result in this environment: blocked (`fetch failed`) for every endpoint because HTTPS egress to Render is blocked by the Codex proxy.
- Local exact-contract equivalent: green against `http://127.0.0.1:4112`.

## 11. Build/test result

- `npm test`: passed, 8 files / 84 tests.
- `npm run build`: passed.
- `npm run frontend:build`: passed.
- Built bundle inspection confirmed the Render backend fallback string `https://reversal.onrender.com` is present and the frontend-origin API host is not used as an API base fallback.

## 12. Remaining deployment actions

- Deploy this branch to the backend service backing `https://reversal.onrender.com`.
- Deploy/rebuild the frontend with `VITE_API_BASE=https://reversal.onrender.com` in Render settings; the code now has a safe production fallback, but the environment variable should still be set explicitly.
- Re-run `API_BASE=https://reversal.onrender.com node scripts/production-api-smoke.js` from CI/Render or another unrestricted network after deployment and confirm `PRODUCTION_API_SMOKE_RESULTS.json.ok === true`.
