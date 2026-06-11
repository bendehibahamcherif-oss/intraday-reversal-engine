# Mobile Historical Data Layout & Multi-Dataset Correlation Fix

## Summary

Two production bugs fixed:

### Bug 1 — Historical Data mobile layout broken

**Root cause**: `HistoricalDataWorkspace.jsx` used a fixed `display: flex` (row direction) with a 320px-wide left panel, causing horizontal overflow on viewports ≤ 768px.

**Fix**:
- Added `useIsMobile()` hook using `window.innerWidth <= 768` with resize event listener
- On mobile: root flex direction → `column`, panel width → `100%`, panel `maxHeight: 240`, `overflow: auto`
- Detail/download panel gets `paddingBottom: 80` on mobile (safe area above bottom nav)
- No horizontal overflow: `document.documentElement.scrollWidth <= clientWidth + 1`

**Files**: `src/workspaces/HistoricalDataWorkspace.jsx`

---

### Bug 2 — Multi-dataset correlation returns "Not enough overlapping observations: 0"

**Root cause**: When a user has two separate single-symbol datasets (`hist_SPY_...` and `hist_NFLX_...`) and requests `SPY,NFLX` correlation using only the SPY dataset, the backend detected `NFLX` as a missing symbol and returned a `missing_symbols` error instead of auto-discovering the NFLX dataset.

**Fix — Backend** (`server-deliverables/api/multiAssetRoutes.js`):
- Added `findCompatibleDatasets(missingSymbols, timeframe, registry)` helper — searches `registry.list()` for datasets with matching `timeframe` and containing the missing symbol
- `/correlation` endpoint: when `datasetId` has missing symbols, auto-discovers compatible datasets, merges candles, computes correlation across combined data
- Returns `resolution: 'multi_dataset'` and `datasetsBySymbol` map (e.g. `{ SPY: 'hist_SPY_...', NFLX: 'hist_NFLX_...' }`) in response
- Added `datasetIds` query param support for explicit multi-dataset requests
- `/beta` endpoint: same auto-discovery logic, same `resolution`/`datasetsBySymbol` fields
- Extracted `computeAndReturnCorrelation()` and `computeBetaFromCandles()` helpers to reduce duplication

**Fix — Frontend** (`src/api.js`, `src/workspaces/MacroWorkspace.jsx`):
- `getMultiAssetCorrelation` and `getMultiAssetBeta` now accept `datasetIds: string[]` param
- `CorrelationMatrix` component: shows "Multi-dataset: SPY → `dataset_id`, NFLX → `dataset_id`" banner when `resolution === 'multi_dataset'`
- `BetaPanel` component: same multi-dataset banner
- Missing symbol response now includes `autoDiscovered` map if partial resolution was possible

---

## Tests Added

### Backend integration (`src/test/multiAssetDatasetCalculation.test.js`)
- `createNflxOnlyDataset` fixture: 60 rows of NFLX with same date range as SPY dataset (ensures overlap)
- `registry.list()` mock patched to return all fixture datasets
- `correlation — multi-dataset auto-discovery`:
  - Auto-discovers NFLX dataset when SPY-only selected → `ok: true, status: ok/not_enough_data, resolution: multi_dataset`
  - Returns `missing_symbols` when symbol absent from ALL known datasets (AAPL)
  - `not_enough_data` from tiny dataset (2 rows, window=20)
  - No NaN/Infinity in multi-dataset responses
- `beta — multi-dataset auto-discovery`:
  - Auto-discovers NFLX for beta when SPY-only selected
  - Returns `missing_symbols` for unknown symbol (AAPL)

### Playwright E2E (`tests/e2e/historical-mobile-layout.spec.ts`)
- `historical data workspace: no horizontal overflow on mobile` — scrollWidth ≤ clientWidth + 1
- `historical data workspace: single-column layout on mobile` — list panel above detail panel
- `historical data workspace: buttons are tappable` — all visible buttons ≥ 24px height

---

## Validation

```
Tests:  239 passed (239)
Build:  ✓ built in 1.81s
Static API scanner: passed (146 files)
Menu duplicate detector: passed (19 workspaces)
```

---

## Constraints Honored

- No fake correlation values
- No empty matrix silently hidden
- No modules removed or hidden
- No visual identity changes
- Credentials stored only on backend
- No path traversal in dataset file resolution
- Branch: `claude/intraday-reversal-frontend-audit-cM6Lu`
