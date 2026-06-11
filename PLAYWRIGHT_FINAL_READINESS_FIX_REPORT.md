# Playwright Final Readiness Fix Report

## App crawler fix

- Removed the duplicate desktop Operations/Settings shortcut in normal canonical registry state.
- The sidebar now uses the canonical desktop workspace registry as the single source of visible desktop controls.
- Legacy `Settings` still resolves to canonical `Ops`; it is not rendered as a second menu entry when `Ops` is already in the canonical list.

## Desktop navigation fix

- Ensured each implemented desktop workspace has exactly one visible `data-testid` nav control and exactly one accessible label through the canonical registry path.
- Updated `tests/e2e/navigation-accessibility.spec.ts` to assert:
  - one nav control per canonical workspace test id,
  - one visible desktop control per canonical short label,
  - no duplicate labels,
  - the rendered label set equals the canonical registry label set.

## Production journey fix

- Preserved `MacroMultiAsset` as the canonical Macro id and kept legacy aliases available through helper resolution.
- Added deterministic E2E historical fixtures for compatible `SPY` and `NFLX` datasets.
- Added deterministic multi-dataset Macro mock responses so the journey can prove:
  - input symbols are `SPY,NFLX`,
  - exactly two assets are represented,
  - resolver status is `ready_multi_dataset`,
  - beta defaults to `NFLX` versus `SPY`,
  - requests have ordered dataset IDs for SPY then NFLX.

## Historical mobile touch target fix

- Historical Data workspace action buttons now have minimum 44px height and width.
- Refresh, Download, Detail/Download tab buttons, Delete, and “Use for …” actions use touch-friendly padding.
- Mobile top-bar Logout, which is part of `terminal-shell`, also now meets the 44px touch target while preserving the compact desktop styling.

## Historical mobile overflow fix

- Long dataset IDs, CSV paths, rows-by-symbol text, warnings, tags, notifications, and detail table values wrap safely inside their own containers.
- Detail tables use fixed layout, constrained value cells, `overflowWrap: anywhere`, and `wordBreak: break-word`.
- The mobile top bar drops desktop-only center/user/latency text and narrows fixed controls so it no longer widens the page.

## Final command results

- `npm test` — passed: 21 test files, 247 tests.
- `npm run build` — passed with existing Vite chunk-size/dynamic-import warnings.
- `npm run frontend:build` — passed with existing Vite chunk-size/dynamic-import warnings.
- `node scripts/static-api-scanner.js` — passed.
- `node scripts/detect-menu-duplicates.js` — passed: 19 workspaces.
- `npx playwright test` — environment-blocked after metadata-only tests: 4 passed, 2 skipped, 28 browser-backed tests failed to launch because the Playwright Chromium executable is missing. `npx playwright install chromium` was attempted and failed with CDN `403 Forbidden` in this environment.
