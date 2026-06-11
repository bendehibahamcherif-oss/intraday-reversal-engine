# Playwright Final Readiness Fix Report

## App crawler fix

- Fixed the desktop app crawler duplicate-menu failure by ensuring the desktop sidebar renders only one visible control for each canonical workspace.
- The canonical `Ops` workspace remains in the registry and legacy `Settings` still resolves to `Ops`, but the legacy bottom shortcut is not rendered when `Ops` is already present in `getDesktopWorkspaces()`.
- Macro remains canonical as `MacroMultiAsset`; no Macro/Multi-Asset duplicate entry was introduced.

## Desktop navigation fix

- Desktop navigation now uses the canonical workspace registry without rendering the `Settings` alias as a second visible Operations control.
- Added a regression assertion to `tests/e2e/navigation-accessibility.spec.ts` that every canonical desktop workspace has exactly one desktop navigation control by `data-testid` and exactly one matching sidebar `aria-label` button.
- Aliases remain aliases and are not rendered as duplicate visible menu entries.

## Production journey fix

- The production journey's initial duplicate-label contract is addressed by the same canonical desktop navigation fix.
- The journey can still resolve the legacy `Settings` alias to canonical `Ops` through registry metadata while visible navigation remains deduplicated.
- The Macro journey keeps using canonical `MacroMultiAsset`; no stale Macro duplicate is restored.

## Historical mobile touch-target fix

- Added a `historical-data-workspace` root class and mobile-scoped CSS for buttons inside the Historical Data workspace.
- On mobile (`max-width: 768px`), Historical Data buttons now have `min-height: 44px`, `min-width: 44px`, adequate padding, wrapping text, and stable line-height.
- The fix is scoped to Historical Data mobile layouts and does not alter the desktop terminal navigation identity.

## Historical mobile overflow fix

- Added safe containment for long Historical Data content including dataset IDs, CSV paths, provider/status strings, notification text, and detail-table values.
- Dataset list rows and detail fields now consistently use `minWidth: 0`, `maxWidth: 100%`, `overflow-wrap: anywhere`, and `word-break: break-word` where needed.
- Mobile form rows wrap instead of widening the page, preserving all dataset information without horizontal document overflow.

## Final command results

| Command | Result |
| --- | --- |
| `npm test` | Passed: 21 test files, 247 tests. |
| `npm run build` | Passed with existing Vite chunk-size/dynamic-import warnings. |
| `npm run frontend:build` | Passed with existing Vite chunk-size/dynamic-import warnings. |
| `node scripts/static-api-scanner.js` | Passed: 146 files scanned. |
| `node scripts/detect-menu-duplicates.js` | Passed: 19 workspaces. |
| `npx playwright test` | Environment-blocked: browser-backed tests cannot launch because Chromium is missing and browser installation is blocked by HTTP 403 in this container. Metadata/API tests that do not require browser launch executed before the browser-launch failures. |

## Playwright environment limitation

Local Playwright browser validation is blocked by the environment rather than by application assertions:

- Missing executable: `/root/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell`
- `npx playwright install chromium` failed with `403 Forbidden` from the Playwright CDN.
- `apt-get install chromium` failed with `403 Forbidden` from the configured package repositories/proxy.

## Final micro-fix: Historical Data mobile buttons and long fields

- **Exact small button identified:** the Historical Data dataset-list refresh icon button (`title="Refresh"`, visible text `⟳`) used compact inline padding (`2px 8px`) on top of the shared compact Historical button style. The failing Playwright assertion reported this button path as a visible 22 px-high control before the micro-fix; the delete icon button used the same compact style family and was hardened at the same time.
- **Measured height before fix:** 22 px in `tests/e2e/historical-mobile-layout.spec.ts` under the 390×844 mobile viewport, below the test's 24 px floor and below the desired 44 px mobile touch target.
- **CSS/file fixed:** `src/terminal.css` now applies mobile-only Historical Data button rules with `display: inline-flex`, centered alignment, `min-height: 44px`, `min-width: 44px`, adequate padding, normal line-height, and `!important` protection so compact inline padding cannot collapse the mobile touch target. `src/workspaces/HistoricalDataWorkspace.jsx` also gives Historical action buttons explicit `historical-action-button` / `historical-icon-button` classes and a safe 24 px desktop baseline.
- **Long field overflow root cause:** long dataset IDs and CSV/path-like values were inside nested flex/table/detail containers where some children had `max-width: 100%` but not consistent `min-width: 0`, and the detail table was not wrapped in an explicit constrained overflow container. Long text could therefore force a descendant box wider than the viewport even when the workspace root clipped horizontal overflow.
- **Long field containment fix:** `src/terminal.css` now scopes `min-width: 0`, `max-width: 100%`, `overflow-wrap: anywhere`, `word-break: break-word`, normal white-space, and a constrained `.historical-table-wrap` to Historical Data. `src/workspaces/HistoricalDataWorkspace.jsx` wraps the detail table in `.historical-table-wrap`, marks the detail card, and makes the dataset row ID flex child shrink safely while preserving all field text.
- **Targeted historical-mobile-layout result:** `npx playwright test tests/e2e/historical-mobile-layout.spec.ts --reporter=line` is still environment-blocked in this container before assertions execute because Chromium is missing at `/root/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell`.
- **Full Playwright result:** `npx playwright test --reporter=line` imports and runs non-browser tests, but all browser-backed tests remain environment-blocked for the same missing Chromium executable. This environment also blocks remediation: `npx playwright install chromium` failed with CDN/proxy `403 Forbidden`, and `apt-get install chromium` failed with repository/proxy `403 Forbidden`.
