# Macro Correlation/Beta Final Fix Report

## Root cause

- The Macro workspace initialized from a six-symbol default universe and the asset count was derived from the last backend correlation response, so stale Macro state or legacy `reversal-macro` localStorage could make the UI show `6 assets` even after the user typed `SPY,NFLX`.
- The stale dataset selector was split across Macro state, Historical Data state, and localStorage. The key now used by Macro is `reversal-macro-selected-correlation-dataset-id`; legacy `reversal-macro` state is read only for initial symbol text and is never merged into the active symbol list.
- The resolver previously validated only the selected dataset first. If the selected dataset was single-symbol NFLX and the input was `SPY,NFLX`, it could report `missing_symbols` instead of searching the registry for a compatible SPY dataset.
- Backend aligned rows could be zero or underreported because daily timestamps with time components were matched literally and explicit `datasetIds` were not mapped in requested-symbol order.

## Frontend behavior after fix

- Symbols are normalized from the current input field only: split on comma/whitespace, uppercase, trim, remove duplicates, cap at 12, and require at least two symbols.
- Default Macro symbols are now `SPY,NFLX`.
- On Apply, Macro overwrites `symbols`, normalizes `symbolsInput`, clears previous correlation/beta results/errors, persists only the normalized symbol string, and refreshes with those symbols only.
- On Refresh All, Macro reparses the current input and never appends defaults or persisted symbols.
- The displayed correlation asset count is `normalizedSymbols.length`, not the previous backend result length.
- On mount, Macro validates `selectedCorrelationDatasetId` against the current Historical Data registry. Missing IDs are cleared from state and from `reversal-macro-selected-correlation-dataset-id` before requests are built.
- Historical Data “Use for Correlation” updates the Macro selected dataset immediately; deleting that dataset clears Macro state only when the deleted ID is the active Macro dataset.
- Beta defaults and normalization keep `NFLX` as asset and `SPY` as benchmark for `SPY,NFLX`, and prevent asset/benchmark equality when two symbols exist.

## Multi-dataset resolution

Given ready datasets:

- `hist_SPY_1d_RTH_20250611_20260611_yahoo`
- `hist_NFLX_1d_RTH_20250611_20260611_yahoo`

and symbols `SPY,NFLX`, timeframe `1d`, window `20`, the resolver returns a multi-dataset resolution with:

```json
{
  "status": "ready_multi_dataset",
  "symbols": ["SPY", "NFLX"],
  "datasetIds": [
    "hist_SPY_1d_RTH_20250611_20260611_yahoo",
    "hist_NFLX_1d_RTH_20250611_20260611_yahoo"
  ],
  "datasetsBySymbol": {
    "SPY": "hist_SPY_1d_RTH_20250611_20260611_yahoo",
    "NFLX": "hist_NFLX_1d_RTH_20250611_20260611_yahoo"
  }
}
```

The UI displays: `Using compatible datasets: SPY, NFLX`.

## Exact request examples

Correlation:

```text
/api/multi-asset/correlation?symbols=SPY,NFLX&datasetIds=hist_SPY_1d_RTH_20250611_20260611_yahoo,hist_NFLX_1d_RTH_20250611_20260611_yahoo&window=20&timeframe=1d
```

Beta:

```text
/api/multi-asset/beta?symbol=NFLX&asset=NFLX&benchmark=SPY&symbols=SPY,NFLX&datasetIds=hist_SPY_1d_RTH_20250611_20260611_yahoo,hist_NFLX_1d_RTH_20250611_20260611_yahoo&window=20&timeframe=1d
```

## Backend alignment fix

- `datasetIds` are parsed as an ordered list and mapped to the requested `symbols` order.
- CSV loading now detects timestamp/date/symbol/close columns and normalizes daily dates to `YYYY-MM-DD`, removing time components such as `T00:00:00.000Z`.
- Correlation and beta compute common close dates across symbols, expose `alignedRows`, and return structured diagnostics for `not_enough_data`.
- Return observations now represent all overlapping return observations, not only the rolling window slice.
- Successful dataset-backed correlation/beta responses use `status: "ready"` and `resolution: "multi_dataset"` when multiple datasets are used.
- Responses are passed through JSON sanitization to avoid `NaN`, `Infinity`, `undefined`, raw stack traces, HTML, or unstructured 500s.

## Tests added or extended

- `src/test/macroFinalRegression.test.jsx`
  - stale six-symbol localStorage regression
  - stale selected dataset clearing regression
  - SPY/NFLX multi-dataset resolver regression
  - beta defaults/request regression
- `src/test/multiAssetDatasetCalculation.test.js`
  - explicit `datasetIds=SPY_ID,NFLX_ID` correlation regression
  - explicit `datasetIds=SPY_ID,NFLX_ID` beta regression
  - date alignment verifies identical dates produce `alignedRows > 20`
- `tests/e2e/historical-mobile-layout.spec.ts`
  - long dataset ID and CSV path containment on 390×844 mobile viewport

## Validation results

- `npm test` — passed: 21 files, 247 tests.
- `npm run build` — passed, with existing Vite chunk-size/dynamic-import warnings.
- `npm run frontend:build` — passed, with existing Vite chunk-size/dynamic-import warnings.
- `node scripts/static-api-scanner.js` — passed.
- `node scripts/detect-menu-duplicates.js` — passed.
- `npx playwright test tests/e2e/historical-mobile-layout.spec.ts` — previously blocked by missing Playwright Chromium browser.
- `npx playwright install chromium` — blocked by CDN 403 in this environment.
- `npx playwright test` — no longer fails during spec import with `Missing implemented workspace metadata for Macro`; the metadata-only Playwright assertions pass, then browser-backed tests are blocked because Chromium is not installed in this environment.


## Playwright Macro workspace metadata fix

- **Root cause of `Missing implemented workspace metadata for Macro`:** `tests/e2e/production-user-journey.spec.ts` requested workspace metadata with the removed legacy id `Macro`. The canonical registry intentionally removed `Macro` as a duplicate top-level workspace and kept one visible Macro capability under `MacroMultiAsset`, so the E2E helper's canonical-id-only lookup returned no implemented workspace for the legacy id.
- **Canonical Macro workspace id:** `MacroMultiAsset`.
- **Aliases supported:** `Macro`, `macro`, `MACRO`, `MA`, `MultiAsset`, `macroMultiAsset`, `Live Markets`, `Correlation`, and `Beta` resolve to `MacroMultiAsset` where alias resolution is supported. `Settings` similarly resolves to the canonical `Ops` workspace instead of reintroducing a duplicate Settings entry.
- **Files changed:** `src/config/workspaces.js`, `src/test/workspaceRegistryCanonical.test.js`, `tests/e2e/helpers/workspaceData.ts`, `tests/e2e/api-mock-coverage.spec.ts`, `tests/e2e/production-user-journey.spec.ts`, `scripts/detect-menu-duplicates.js`, and this report.
- **Final Playwright result:** `npx playwright test` imports the suite and passes the metadata-only Macro alias regression before browser launch. The remaining browser-backed tests cannot launch locally because `/root/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell` is absent, and `npx playwright install chromium` is blocked by a CDN `403 Forbidden` response in this environment.

## Backend validation status

The separate backend repository `bendehibahamcherif-oss/reversal` is not checked out in this workspace. The backend-compatible route copy in this repository (`server-deliverables/api/multiAssetRoutes.js`) was fixed and covered by Vitest regression tests. Requested backend scripts such as `scripts/backend-route-discovery.js`, `scripts/api-contract-crawler.js`, `scripts/backend-payload-fuzzer.js`, `scripts/run-backend-production-readiness.js`, and `scripts/production-api-contract-smoke.js` are not present in this repo.

## Deployment status

Changes are committed on the current branch and ready for PR. Production deployment is pending merge/deploy of the frontend changes and propagation of the same backend route changes into `bendehibahamcherif-oss/reversal` if that repo is managed separately.

## Remaining Playwright readiness fixes after Macro metadata

### Remaining Playwright failures found

- `tests/e2e/app-crawler.spec.ts` failed its duplicate-menu contract because the desktop sidebar exposed the canonical Operations workspace twice.
- `tests/e2e/navigation-accessibility.spec.ts` failed because the duplicated Operations controls meant there was not exactly one desktop control per canonical workspace.
- `tests/e2e/production-user-journey.spec.ts` failed at the initial duplicate-label gate for the same duplicated Operations/Settings control.
- `tests/e2e/historical-mobile-layout.spec.ts` failed mobile touch-target checks because Historical Data buttons used compact desktop padding with no mobile minimum size.
- `tests/e2e/historical-mobile-layout.spec.ts` failed mobile containment checks because long Historical Data identifiers/paths could widen flex/table cells beyond the viewport.

### Root cause for each

- Operations was included in the canonical desktop registry and then rendered again as a legacy bottom Settings shortcut that resolves to the same `Ops` workspace.
- Historical Data had no workspace-scoped mobile touch-target CSS, so refresh/delete/tabs/download/use-action buttons could render below 44 px on 390 px mobile viewports.
- Historical Data list/detail fields had long unbroken dataset IDs and CSV paths inside flex/table containers without consistent `min-width: 0`, `max-width: 100%`, and `overflow-wrap: anywhere` containment.

### Exact files fixed

- `src/TerminalSidebar.jsx`
- `src/workspaces/HistoricalDataWorkspace.jsx`
- `src/terminal.css`
- `tests/e2e/navigation-accessibility.spec.ts`
- `PLAYWRIGHT_FINAL_FAILURE_ANALYSIS.md`
- `PLAYWRIGHT_FINAL_READINESS_FIX_REPORT.md`

### Final Playwright result

- `npx playwright test` runs the full 34-test suite and the non-browser metadata/API contract tests execute, but this container cannot launch Chromium because `/root/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell` is missing.
- `npx playwright install chromium` was attempted and failed with CDN/proxy `403 Forbidden`; `apt-get install chromium` was also blocked by repository/proxy `403 Forbidden`.
- Therefore local Playwright browser validation remains environment-blocked here; all non-browser validation commands pass after the readiness fixes.
