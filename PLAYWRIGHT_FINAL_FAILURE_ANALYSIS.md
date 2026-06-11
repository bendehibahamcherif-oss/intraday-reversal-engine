# Playwright Final Failure Analysis — Historical Mobile Layout

## Root Cause Table

| Failure | Location | Root Cause | Fix Applied |
|---------|----------|------------|-------------|
| "No visible buttons found in Historical Data workspace" | `historical-mobile-layout.spec.ts:91` | `window.__ZUSTAND_WORKSPACE_STORE__` is never exposed on `window` in any source file; the `page.evaluate()` call silently did nothing; workspace never switched to HistoricalData; no dataset was ever selected so action buttons never rendered | Replaced all `window.__ZUSTAND_WORKSPACE_STORE__` navigation with `openMobileWorkspace()` from `appHarness.ts`; waits for `dataset-list-panel` to contain `e2e-dataset` text, clicks dataset row, waits for `dataset-detail-panel` and `dataset-actions` before measuring button heights |
| "waiting for getByText('e2e-dataset').first()" | `historical-mobile-layout.spec.ts:144` | Test 4 (long detail fields) was written with the same broken navigation pattern; never reached a state where `e2e-dataset` appeared in the DOM | Same navigation fix applied; additionally enriched `historicalDataset` mock with a long CSV path so overflow containment can be exercised |
| Single-column layout assertion used text-content matching against generic element text | `historical-mobile-layout.spec.ts:47` | Selector heuristic fragile; fallback `if (layout !== null)` masked real navigation failure | Replaced with bounding-box comparison between `dataset-list-panel` and the second child of the workspace root |

## What Was Never Set

```js
// App.jsx / workspaceStore.js — these lines DO NOT EXIST:
window.__ZUSTAND_WORKSPACE_STORE__ = useWorkspaceStore;   // ← never exported to window
```

The store is only exported as:
```js
export const useWorkspaceStore = create(...);   // src/store/workspaceStore.js
```

Any `page.evaluate()` block that reads `window.__ZUSTAND_WORKSPACE_STORE__` returns `undefined`, and `if (store) store.getState().setWorkspace(...)` never executes.

## Navigation Path (correct)

```
bootApp()
  └─ installs auth + API mocks, navigates to '/', waits for terminal-shell

openMobileWorkspace(page, { id: 'HistoricalData', label: 'Historical Data', shortLabel: 'HD' })
  └─ clicks [data-testid="mobile-more-workspaces"]
  └─ waits for role="dialog"[name="More workspaces"]
  └─ clicks [data-testid="workspace-nav-historical-data"]  ← auto-generated navTestId
  └─ React re-renders HistoricalDataWorkspace

expect([data-testid="historical-data-workspace"]).toBeVisible()
  └─ confirms workspace rendered

expect([data-testid="dataset-list-panel"]).toContainText('e2e-dataset')
  └─ waits for store.fetchDatasets() to complete (mock returns e2e-dataset)

click dataset row → handleSelect('e2e-dataset') → setActiveTab('detail')
  └─ store.selectedDataset set synchronously
  └─ DatasetDetail renders with status:'ready', fileExists:true → actions visible

expect([data-testid="dataset-actions"]).toBeVisible()
  └─ 3 action buttons: Use for ML Training, Use for Backtesting, Use for Correlation
```

## Files Modified

| File | Change |
|------|--------|
| `tests/e2e/historical-mobile-layout.spec.ts` | Complete rewrite — 4 tests using `openMobileWorkspace`, proper async waits, scoped selectors |
| `tests/e2e/helpers/apiMocks.ts` | `historicalDataset.symbols` → `['SPY','NFLX']`; long CSV path for overflow test; diagnostics with `symbols`, `rowsBySymbol`, `usableFor`, `columns` |
| `src/workspaces/HistoricalDataWorkspace.jsx` | Added `data-testid` on workspace root, list panel, detail panel, empty state, actions container, and each action button; `S_ACTION_BTN` with `minHeight: 44`; table with `tableLayout: fixed` and value cells with `overflowWrap: anywhere` |
| `src/terminal.css` | Scoped CSS for `.historical-data-workspace` — 44px min touch targets on buttons; `max-width: 100%` / `min-width: 0` on all children; `overflow-wrap: anywhere` on value cells |
