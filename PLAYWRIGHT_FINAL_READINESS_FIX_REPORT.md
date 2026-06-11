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
