# Playwright Final Readiness Fix Report

## Status: PASSED

All 4 historical mobile layout tests now pass.

## Test Results

```
tests/e2e/historical-mobile-layout.spec.ts  4/4 passed (20.9s)
  ✓ historical data workspace: no horizontal overflow on mobile
  ✓ historical data workspace: single-column layout on mobile
  ✓ historical data workspace: buttons are tappable (min 44px touch target)
  ✓ historical data workspace: long detail fields stay contained on mobile
```

## Full Validation Suite

```
Unit tests:      239 passed (239)
Build:           ✓ built in 2.15s
Static scanner:  passed (146 files)
Menu detector:   passed (19 workspaces)
Playwright (mobile spec): 4/4 passed
```

## Changes Made

### 1. `tests/e2e/historical-mobile-layout.spec.ts` — Complete rewrite

**Before**: All 3 tests used `window.__ZUSTAND_WORKSPACE_STORE__` which is never exported on `window`. The evaluate block silently did nothing, so the workspace never switched and no dataset was ever visible. Test 3 ("buttons are tappable") found 0 buttons. Test 4 ("long detail fields") didn't exist.

**After**: 
- 4 tests using `openMobileWorkspace(page, { id: 'HistoricalData', label: 'Historical Data', shortLabel: 'HD' })` — properly navigates via the More drawer (`mobile-more-workspaces` → `workspace-nav-historical-data`)
- Waits for `[data-testid="historical-data-workspace"]` to be visible
- Tests 3 and 4 wait for `e2e-dataset` in the list panel, click the dataset row, wait for `[data-testid="dataset-detail-panel"]` and `[data-testid="dataset-actions"]`
- Test 3 measures button heights in `dataset-actions` — expects ≥ 44px
- Test 4 measures overflow after long CSV path is rendered in the detail table

### 2. `tests/e2e/helpers/apiMocks.ts` — Richer historicalDataset

- `symbols: ['SPY', 'NFLX']` (2 symbols for more realistic detail view)
- `rowCount: 960`, `rowsBySymbol: { SPY: 480, NFLX: 480 }`
- Long CSV path: `.../very-long-path-name/e2e-dataset-SPY_NFLX-1d-...csv` (exercises overflow containment)
- Diagnostics: added `symbols`, `rowsBySymbol`, `usableFor`, `columns` fields

### 3. `src/workspaces/HistoricalDataWorkspace.jsx` — Testable structure

- `data-testid="historical-data-workspace"` + `className="historical-data-workspace"` on root
- `data-testid="dataset-list-panel"` on left panel
- `data-testid="dataset-detail-panel"` on detail section
- `data-testid="dataset-detail-empty"` on empty state
- `data-testid="dataset-actions"` on action button container
- `data-testid="btn-use-for-ml"`, `"btn-use-for-backtest"`, `"btn-use-for-correlation"` on each button
- `data-testid="dataset-detail-id"` on dataset ID heading
- `S_ACTION_BTN(accent)` style helper: `minHeight: 44`, `width: '100%'`, `display: 'flex'`
- Table: `tableLayout: 'fixed'` + `<colgroup>` with 90px label column
- Value cells: `wordBreak: 'break-word'`, `overflowWrap: 'anywhere'`, `minWidth: 0`, `maxWidth: 0`, `className="dataset-value-cell"`
- Mobile root: `flexDirection: 'column'`, `panelStyle.width: '100%'`, `maxHeight: 240`

### 4. `src/terminal.css` — Scoped touch target & overflow CSS

```css
.historical-data-workspace button,
.historical-data-workspace [role="button"] {
  min-height: 44px; min-width: 44px;
  display: inline-flex; align-items: center; justify-content: center;
  box-sizing: border-box;
}
.historical-data-workspace, .historical-data-workspace * {
  max-width: 100%; min-width: 0; box-sizing: border-box;
}
.historical-data-workspace .dataset-value-cell,
.historical-data-workspace code, .historical-data-workspace pre,
.historical-data-workspace td {
  overflow-wrap: anywhere; word-break: break-word; white-space: normal;
}
```

## Constraints Honored

- No tests skipped
- No assertions weakened (button threshold raised from 24px to 44px)
- Historical Data workspace not removed or hidden
- Action buttons not hidden
- Macro / Multi-Asset untouched
- Backend untouched
- Real navigation used (More drawer + workspace-nav-historical-data)
- Branch: `claude/intraday-reversal-frontend-audit-cM6Lu`
