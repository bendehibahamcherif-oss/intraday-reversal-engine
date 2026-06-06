# Mobile Navigation Fix Report

## 1. Missing mobile menus found

Mobile navigation previously exposed only Chart, Markets, Alerts, ML, and a mislabeled More item that navigated directly to Portfolio. Desktop-only or implicit workspaces missing from reliable mobile access included Live Data, Providers, Credentials, Stream Status, Provider Diagnostics, Volume Profile, Historical Data, Backtesting, Paper Trading, Portfolio, Risk, Macro / Multi-Asset, Correlation, Beta, Strategy Lab, Quant Lab, Replay, Settings / More, and several ML sub-workspaces.

## 2. Root cause

Workspace definitions were duplicated across the desktop sidebar, mobile bottom navigation, command palette, and workspace renderer. The mobile `MORE` item was not an overflow menu; it was a hardcoded Portfolio tab. Because the workspace store accepted arbitrary persisted ids, stale or invalid localStorage values could also point navigation at a non-canonical workspace id.

## 3. Workspace registry changes

Added `src/config/workspaces.js` as the canonical workspace registry. The registry defines id, label, short label, icon, component key, group, mobile/desktop visibility, implementation status, ordering, primary-mobile status, and aliases. Added `src/config/workspaceComponents.jsx` as the component resolution layer for renderable workspace components.

Desktop sidebar, mobile navigation, command palette, workspace rendering, workspace validation, tests, and the smoke script now read from this registry instead of maintaining separate hardcoded workspace subsets.

## 4. Mobile More menu changes

Updated `MobileBottomNav` to keep the existing bottom navigation layout while adding a real scrollable More drawer. Primary mobile shortcuts are Chart, Markets, Alerts, AI Lab, and More. The More drawer includes all secondary mobile-visible workspaces, highlights the active workspace, uses touch-sized entries, closes after selection, and disables entries safely if a future registry item is marked unimplemented.

## 5. State/persistence fixes

The workspace store now defaults to Chart, validates every requested workspace id, validates persisted workspace state on rehydration, and writes only normalized workspace ids to localStorage. Invalid or stale workspace ids reset safely to the default workspace rather than causing a missing or blank route.

## 6. Tests added

Added `src/test/mobileNavigation.test.jsx` covering:

1. Desktop workspaces are represented in the canonical registry.
2. Implemented workspaces are accessible on mobile via primary nav or More.
3. Mobile More opens.
4. Mobile More contains Historical Data.
5. Mobile More contains Backtesting.
6. Mobile More contains Portfolio.
7. Mobile More contains Risk.
8. Mobile More contains Macro / Multi-Asset and Correlation.
9. Historical Data selection renders Historical Data content.
10. AI Lab selection renders AI Lab content.
11. Backtesting selection renders backtesting content.
12. Portfolio selection renders Portfolio content.
13. Risk selection renders Risk content.
14. More closes after selection.
15. Active workspace persists to the store payload.
16. Invalid persisted/current workspace resets safely.
17. Implemented workspaces resolve non-missing components.

Updated existing terminal shell tests for the new Chart default and command palette registry search.

## 7. Smoke result

`node scripts/mobile-navigation-smoke.js` wrote `MOBILE_NAVIGATION_SMOKE_RESULTS.json` with:

```json
{
  "ok": true,
  "totalWorkspaceCount": 33,
  "mobileAccessibleCount": 33,
  "mobilePrimaryCount": 4,
  "mobileMoreCount": 29,
  "mobileMissingWorkspaces": [],
  "unimplementedWorkspaces": [],
  "invalidWorkspaceMappings": [],
  "missingComponents": [],
  "duplicateIds": []
}
```

## 8. Manual validation checklist

- [ ] Open app on Android mobile.
- [ ] Confirm primary nav appears.
- [ ] Open More menu.
- [ ] Verify every workspace is accessible.
- [ ] Open Historical Data.
- [ ] Open AI Lab.
- [ ] Open Backtesting.
- [ ] Open Macro / Correlation.
- [ ] Open Portfolio.
- [ ] Open Risk.
- [ ] Refresh page.
- [ ] Confirm active workspace persists or resets safely.
- [ ] Confirm no menu disappears.

Manual device validation was not executed in this non-interactive container.
