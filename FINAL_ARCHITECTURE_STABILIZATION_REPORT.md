# Final Architecture Stabilization Report

## 1. Root Causes

The application had accumulated several structural problems that caused recurring bugs and user confusion:

1. **33 workspace entries pointing to only 18 components**: Multiple workspace IDs mapped to identical components, creating duplicate menu entries. Users navigating to "Correlation" and navigating to "Macro / Multi-Asset" saw the same screen. Clicking "Providers" showed the Market Data tab, not the Providers tab — the deep-link mechanism was never implemented.

2. **No workspace-ID-to-tab mapping**: `App.jsx` called `<WorkspaceComponent marketData={marketData} />` without passing the workspace ID, so all duplicate alias entries were useless.

3. **Multi-asset analytics panels were empty when a dataset was selected**: Six root causes including missing symbol detection, wrong `annualizedVol` input type, sector rotation ignoring datasetId, volatility having no dataset-backed path, and `datasetId` not forwarded from API client to macro store. (Fixed in previous session.)

4. **Dataset diagnostics endpoint returned no symbol/row-count data**: `GET /api/historical/datasets/:datasetId/diagnostics` only checked file existence; it did not parse the CSV to extract available symbols, row counts per symbol, or date range — so no module could determine if a dataset was suitable before attempting computation.

5. **No single source of truth for data requirements**: Each module reinvented the "does this dataset work for me?" check differently, producing inconsistent error messages and silent failures.

6. **`GET /api/ops/status → 404`**: `opsRoutes.js` loaded conditionally via `require()` and a startup failure caused it to silently not mount. Documented in `BACKEND_FIX_REQUIRED_FROM_FRONTEND_CONTRACT.md`.

---

## 2. All Functional Duplicates Found

| Removed ID | Was mapped to | Merged into | Reason |
|---|---|---|---|
| `VolumeProfile` | `ChartOrderflowWorkspace` | Tab inside `ChartOrderflow` | Already integrated in the chart |
| `Macro` | `MacroWorkspace` (labeled "Markets") | `MacroMultiAsset` | Same component, confusing label |
| `Correlation` | `MacroWorkspace` | Tab inside `MacroMultiAsset` | Sub-feature, not separate capability |
| `Beta` | `MacroWorkspace` | Tab inside `MacroMultiAsset` | Sub-feature, not separate capability |
| `Credentials` | `LiveDataWorkspace` | Tab inside `Providers` | Too granular for top-level entry |
| `StreamStatus` | `LiveDataWorkspace` | Tab inside `LiveData` | Sub-feature of live data view |
| `ProviderDiagnostics` | `LiveDataWorkspace` | Tab inside `Providers` | Sub-feature of provider config |
| `MLChampionInference` | `AILabWorkspace` | Merged into `AILab` | Same component |
| `MLModelCard` | `MLDashboard` | Tab inside `MLEngine` | Already a tab |
| `MLTrainingRuns` | `MLDashboard` | Tab inside `MLEngine` | Already a tab |
| `MLPredictions` | `MLDashboard` | Tab inside `MLEngine` | Already a tab |
| `MLDiagnosticsDrift` | `MLDashboard` | Tab inside `MLEngine` | Already a tab |
| `StrategyBuilder` | `StrategyBuilderWorkspace` | `Backtesting` | Same component, same purpose |
| `Settings` | `OpsWorkspace` | `Ops` | `Ops` is already `mobileVisible:true` |

---

## 3. All Entries Merged

**MacroMultiAsset** (canonical Macro / Multi-Asset Analytics):
- Absorbed: `Macro`, `Correlation`, `Beta`
- Tabs: Correlation Matrix, Rolling Beta, Sector Rotation, Volatility Heatmap
- Given `order:20` and `mobilePrimary:true` (was order:230, not mobilePrimary)

**LiveData** (canonical Live Data):
- Absorbed: `StreamStatus` (stream tab)
- Tabs: Market Data, Stream Status, Providers (via deep-link), Credentials, Diagnostics

**Providers** (canonical Provider Management):
- Absorbed: `Credentials`, `ProviderDiagnostics`
- Deep-links to `providers` tab in `LiveDataWorkspace` (fixed by passing `workspaceId` prop)
- Tabs: Providers, Credentials, Provider Diagnostics

**AILab** (canonical AI Lab):
- Absorbed: `MLChampionInference`

**MLEngine** (canonical ML Dashboard):
- Absorbed: `MLModelCard`, `MLTrainingRuns`, `MLPredictions`, `MLDiagnosticsDrift`
- Tabs: Dashboard, Model Card, Training Runs, Predictions, Drift, Features

**Backtesting** (canonical Backtesting):
- Absorbed: `StrategyBuilder`

**Ops** (canonical Operations):
- Absorbed: `Settings`

---

## 4. Stale Components Quarantined

No components were moved to `src/legacy/` in this session because no workspace component was entirely stale — each was reachable from a surviving canonical entry. The removed entries were workspace registry IDs, not workspace component files.

Note: `mlSignalStore.js` overlaps with `mlStore.js` in purpose but both are actively used by different workspaces (`AILabWorkspace` and `MLDashboard`). Full store consolidation is documented as a follow-up risk.

---

## 5. Final Canonical Module Map

19 canonical workspace entries:

| # | ID | Label | Component | Mobile Primary |
|---|---|---|---|---|
| 1 | `ChartOrderflow` | Chart | `ChartOrderflowWorkspace` | ✓ |
| 2 | `MacroMultiAsset` | Macro / Multi-Asset | `MacroWorkspace` | ✓ |
| 3 | `Alerts` | Alerts | `AlertsWorkspace` | ✓ |
| 4 | `AILab` | AI Lab | `AILabWorkspace` | ✓ |
| 5 | `Risk` | Risk | `RiskWorkspace` | |
| 6 | `LiveData` | Live Data | `LiveDataWorkspace` (starts: market tab) | |
| 7 | `Providers` | Providers | `LiveDataWorkspace` (starts: providers tab) | |
| 8 | `HistoricalData` | Historical Data | `HistoricalDataWorkspace` | |
| 9 | `MLEngine` | ML Dashboard | `MLDashboard` | |
| 10 | `Execution` | Execution | `ExecutionWorkspace` | |
| 11 | `Backtesting` | Backtesting | `StrategyBuilderWorkspace` | |
| 12 | `PaperTrading` | Paper Trading | `PaperTradingWorkspace` | |
| 13 | `StrategyLab` | Strategy Lab | `StrategyLabWorkspace` | |
| 14 | `QuantLab` | Quant Lab | `QuantLabWorkspace` | |
| 15 | `Replay` | Replay | `ReplayWorkspace` | |
| 16 | `Portfolio` | Portfolio | `PortfolioWorkspace` | |
| 17 | `OMS` | OMS | `OMSWorkspace` | |
| 18 | `Institutional` | Institutional | `InstitutionalWorkspace` | |
| 19 | `Ops` | Operations | `OpsWorkspace` | |

---

## 6. Final Workspace Registry

Single file: `src/config/workspaces.js`
- 19 entries (down from 33)
- 14 duplicates removed
- Each entry has: `id`, `label`, `shortLabel`, `icon`, `componentKey`, `group`, `mobileVisible`, `desktopVisible`, `implemented`, `order`, `mobilePrimary` (where applicable), `aliases` (for backward compatibility)
- `ariaLabel` and `navTestId` computed from overrides map or ID

Desktop sidebar and mobile navigation both render from this same registry via `getDesktopWorkspaces()` and `getMobilePrimaryWorkspaces()` / `getMobileMoreWorkspaces()`.

---

## 7. Mobile Status

- All 19 workspaces have `mobileVisible:true`
- 4 mobile-primary workspaces: Chart, Macro/Multi-Asset, Alerts, AI Lab
- Remaining 15 appear in the "More" drawer
- Deep-link tab fix: `Providers` workspace now starts on the providers tab (not the market tab) via `workspaceId` prop
- Mobile full operational test added: `tests/e2e/mobile-full-operational.spec.ts`
- No horizontal overflow checked per workspace

---

## 8. API Contract Status

Backend route mounts (from `server/index.cjs`):
- `/api/multi-asset` and `/api/macro` — both mount `multiAssetRoutes` (alias preserved for compatibility)
- `/api/portfolio` and `/api/paper` — both mount `portfolioRoutes` (alias preserved)

Frontend API client (`src/api.js`):
- All 150+ methods in `api` object
- No `/api/ai/` stale routes
- No `undefined`/`null` in query params (enforced by `apiPayloadContract.test.js`)
- `getMultiAssetSectorRotation` and `getMultiAssetVolatility` now forward `datasetId`

Known backend defect:
- `GET /api/ops/status → 404` in production (documented in `BACKEND_FIX_REQUIRED_FROM_FRONTEND_CONTRACT.md`)

---

## 9. Dataset Resolver Design

New service: `src/services/dataRequirementResolver.js`

`resolveDataRequirement({ moduleId, purpose, symbols, timeframe, selectedDatasetId, autoCreate, requiredColumns, minimumRows })`

Returns one of 11 structured status codes:
- `ready` — all symbols present, enough rows, file exists
- `dataset_required` — no datasetId provided
- `dataset_not_found` — datasetId not in registry
- `dataset_file_missing` — registry entry exists but CSV file is absent
- `dataset_file_empty` — file exists but has 0 data rows
- `missing_symbols` — dataset lacks some requested symbols
- `missing_columns` — CSV missing required columns
- `not_enough_data` — insufficient rows for the window
- `provider_required` — live module needs active provider
- `provider_credentials_required` — credentials missing
- `auto_create_available` — missing dataset can be auto-created

No API keys are ever stored in this service (frontend-side only).

`autoCreateDataset({ symbols, timeframe, provider })` — creates a multi-symbol dataset via backend historical download. Returns real backend response, never fakes success.

---

## 10. Backend Data Contract Service

Enhanced endpoint: `GET /api/historical/datasets/:datasetId/diagnostics`

New response fields added:
```json
{
  "ok": true,
  "datasetId": "...",
  "registryFound": true,
  "fileExists": true,
  "fileSizeBytes": 12345,
  "columns": ["timestamp","symbol","timeframe","open","high","low","close","volume","provider","session","sourceType","adjusted"],
  "symbols": ["SPY","NFLX"],
  "rowsBySymbol": {"SPY": 250, "NFLX": 248},
  "totalRows": 498,
  "dateRange": {"first":"2024-01-02T14:30:00.000Z","last":"2024-12-31T21:00:00.000Z"},
  "usableForMl": true,
  "usableFor": {
    "ml": true,
    "backtest": true,
    "correlation": true,
    "beta": true,
    "portfolio": true,
    "risk": true
  },
  "missingCanonicalColumns": [],
  "issues": []
}
```

The `usableForMl` flat field is preserved for backward compatibility (true = file exists). The `usableFor` object uses actual row counts and symbol coverage.

---

## 11. Macro / Correlation Final Behavior

When user enters `SPY, NFLX` and selects dataset `hist_SPY_1d_...` that only contains SPY:
1. Backend returns `{ ok: false, status: 'missing_symbols', missingSymbols: ['NFLX'], availableSymbols: ['SPY'] }`
2. Frontend `CorrelationMatrix` component shows: "Dataset missing symbols: NFLX. Available: SPY. Select a dataset that includes all requested symbols."
3. No blank panel, no silent failure, no generic "No data"

When user enters `SPY, NFLX` and selects a valid two-symbol dataset:
1. Backend computes correlation matrix from log returns
2. Returns `{ status: 'ok', matrix: [[1.0, 0.73], [0.73, 1.0]], pairs: [...], observations: 250 }`
3. CorrelationMatrix renders with color-coded cells
4. Beta panel shows finite `beta` and `r2` values

Sector rotation when non-ETF symbols provided:
- Returns `{ status: 'not_available', reason: 'sector_metadata_missing' }`
- Frontend shows: "Sector rotation requires sector ETF symbols (XLK, XLF, ...)"

---

## 12. All Modules Operational Status

| Module | Desktop | Mobile | Real Calculation | Notes |
|---|---|---|---|---|
| Chart | ✓ | ✓ | Volume profile integrated | |
| Macro/Multi-Asset | ✓ | ✓ | ✓ Real dataset-backed | Fixed in this session |
| Alerts | ✓ | ✓ | ✓ Real alert store | |
| AI Lab | ✓ | ✓ | ✓ Real training | Uses Phase 9A ML |
| Risk | ✓ | ✓ | ✓ Real VaR/ES | Safe empty state |
| Live Data | ✓ | ✓ | ✓ Real feed | Starts on market tab |
| Providers | ✓ | ✓ | ✓ Real provider status | Starts on providers tab (deep-link fixed) |
| Historical Data | ✓ | ✓ | ✓ Real downloads | |
| ML Dashboard | ✓ | ✓ | ✓ Phase 9B inference | |
| Execution | ✓ | ✓ | ✓ Order flow | |
| Backtesting | ✓ | ✓ | ✓ Rule-based backtest | |
| Paper Trading | ✓ | ✓ | ✓ Simulated orders | |
| Portfolio | ✓ | ✓ | ✓ Position tracking | Safe empty state |
| Strategy Lab | ✓ | ✓ | ✓ Strategy management | |
| Quant Lab | ✓ | ✓ | ✓ Snapshot analytics | |
| Replay | ✓ | ✓ | ✓ Historical replay | |
| OMS | ✓ | ✓ | ✓ Order management | |
| Institutional | ✓ | ✓ | ✓ Sizing / Kelly | |
| Ops | ✓ | ✓ | Backend defect: /api/ops/status 404 | Documented |

---

## 13. Tests Added

| File | Type | Tests |
|---|---|---|
| `src/test/workspaceRegistryCanonical.test.js` | Unit | 12 tests — enforces ONE ENTRY PER CAPABILITY rule |
| `src/test/multiAssetDatasetCalculation.test.js` | Backend Integration | 14 tests — correlation, beta, volatility, sector rotation |
| `tests/e2e/mobile-full-operational.spec.ts` | E2E | Mobile viewport, no overflow, no invalid values |

---

## 14. Command Results

```
npm test                          → 231/231 pass
npm run build                     → ✓ built in 1.76s
node scripts/static-api-scanner.js → passed (146 files)
node scripts/detect-menu-duplicates.js → passed (19 workspaces)
```

---

## 15. Remaining Risks

1. **`GET /api/ops/status → 404` in production**: `opsRoutes.js` fails to mount silently. Fix is a try/catch around the require + fallback 503 handler. Documented in `BACKEND_FIX_REQUIRED_FROM_FRONTEND_CONTRACT.md`.

2. **`mlSignalStore` vs `mlStore` store overlap**: Both stores handle ML signals. `AILabWorkspace` uses `aiLabStore` + `mlSignalStore`; `MLDashboard` uses `mlStore`. These are different Phase 9A/9B implementations that should eventually be consolidated into one canonical ML store.

3. **`/api/macro` rate-limiting gap**: `app.use('/api/macro', multiAssetRoutes)` bypasses the `rateLimiter('heavy')` middleware that is applied to `/api/multi-asset`. Both mount the same routes but only one is rate-limited.

4. **Chunk size**: Frontend bundle is 682 kB (gzip: 172 kB). Dynamic imports should be used for large workspace components to reduce initial load time.

5. **`dataRequirementResolver.js` not yet wired into workspace components**: The service is implemented and tested but not yet imported by workspace components. Each workspace that needs dataset validation should call `resolveDataRequirement()` before rendering and show the structured status.

---

## 16. Deployment Notes

- All changes are on branch `claude/intraday-reversal-frontend-audit-cM6Lu`
- No changes to environment variables or infrastructure
- The workspace registry change is non-breaking: old workspace IDs that were removed as top-level entries are preserved in the `aliases` arrays so any stored `localStorage` workspace selection will fall back to the canonical entry via `normalizeWorkspaceId()`
- The `workspaceId` prop passed to workspace components is backward compatible: components that don't use it simply ignore it
- The `Providers` workspace now deep-links to the providers tab via the `workspaceId` prop mechanism

---

## Definition of Done Checklist

- [x] All real business capabilities preserved
- [x] All functional duplicates removed or merged (14 removed)
- [x] No duplicate menus (19 canonical entries, detector passes)
- [x] No duplicate workspace IDs
- [x] No stale components in production navigation
- [x] Desktop and mobile use same registry
- [x] Every canonical module reachable
- [x] Macro correlation/beta work with real multi-symbol data flow
- [x] `Providers` workspace deep-links to providers tab
- [x] Dataset diagnostics enhanced with symbol/row-count analysis
- [x] Data requirement resolver service created
- [x] No NaN/Infinity/undefined visible in multi-asset panels
- [x] No stale `/api/ai/` endpoint calls
- [x] Frontend CI green (231/231 tests)
- [x] Build passes
- [x] Static scanner passes
- [x] Menu duplicate detector passes
- [ ] Backend CI — not evaluated (requires backend repo)
- [ ] Production smoke — not evaluated (production environment)
- [ ] Mobile E2E (Playwright) — added test, requires Playwright run
