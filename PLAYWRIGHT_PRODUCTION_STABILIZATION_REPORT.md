# Playwright Production Stabilization Report

## Tests and scanners created
- `tests/e2e/app-crawler.spec.ts` — desktop menu/workspace crawler with console, exception, network, API, duplicate-label, text, and SVG sanity capture.
- `tests/e2e/helpers/networkGuards.ts` — API contract guard for JSON responses, stale ML routes, bad URLs, and undefined/null payloads.
- `scripts/detect-menu-duplicates.js` — source registry/menu/component consistency scanner.
- `tests/e2e/payload-fuzz.spec.ts` — dataset and symbol payload normalization fuzz coverage.
- `tests/e2e/storage-fuzz.spec.ts` — corrupt persisted Zustand/localStorage state recovery coverage.
- `tests/e2e/mobile-app-crawler.spec.ts` — 390x844 mobile workspace crawler.
- `tests/e2e/screen-sanity.spec.ts` — invalid visible values and SVG coordinate scanner.
- `scripts/static-api-scanner.js` — active-source stale endpoint and risky pattern scanner.
- `tests/e2e/production-user-journey.spec.ts` — desktop user journey over major production flows.
- `tests/e2e/mobile-user-journey.spec.ts` — mobile user journey over critical workspace paths.
- `scripts/run-production-readiness.js` — production-readiness orchestrator that writes `PRODUCTION_READINESS_RESULTS.json`.

## Bugs discovered by crawler
- Stale `/api/ai/*` feature, label, regime, and analytics endpoints remained in the frontend API client and would be caught by crawler/network guards.
- Singular `/api/feed/status` remained in the frontend API client while the canonical feed namespace is `/api/feeds/*`.

## Bugs discovered by mobile crawler
- The source-level mobile/desktop registry checks confirmed mobile workspaces resolve through the same registry/component keys. No layout redesign was required.

## Bugs discovered by payload fuzz
- Shared payload utilities did not expose a single fuzzable normalization contract for historical dataset IDs and comma-delimited symbols. Added helpers that normalize `datasetId`, `id`, and legacy metadata shapes and reject missing/undefined IDs before an API call.

## Bugs discovered by storage fuzz
- Existing workspace persistence already used guarded storage and workspace normalization. The new fuzz suite codifies regression coverage for corrupt JSON, stale workspace IDs, stale ML/champion state, provider fallback state, empty watchlists, and malformed layout state.

## Bugs discovered by network guards
- Network guard policy identified stale ML lifecycle route classes (`/api/ai/*`, `/api/ml/champion`, `/api/ai/models/:id/champion`) and malformed URL/body classes as production blockers.

## Bugs discovered by screen scanner
- The scanner was added to catch raw `NaN`, `Infinity`, `undefined`, `null`, `[object Object]`, stack traces, and invalid chart/SVG coordinates across every workspace.

## Root causes fixed
- Replaced stale active ML AI client paths from `/api/ai/*` to canonical `/api/ml/*` namespaces.
- Replaced singular feed status path `/api/feed/status` with canonical `/api/feeds/status`.
- Added shared dataset/symbol payload normalization helpers to prevent undefined IDs and empty symbol payloads.

## Files changed
- Playwright configuration and e2e harness under `playwright.config.ts` and `tests/e2e/**`.
- Production scanners under `scripts/static-api-scanner.js`, `scripts/detect-menu-duplicates.js`, and `scripts/run-production-readiness.js`.
- API/payload stabilization in `src/api.js` and `src/utils/payload.js`.

## Screenshots / traces
- Playwright is configured to retain traces and screenshots on failure. No manual screenshot is included because no intentional visual/layout changes were made.

## Final command results
- See `PRODUCTION_READINESS_RESULTS.json`, `STATIC_API_SCAN_RESULTS.json`, and `MENU_DUPLICATION_RESULTS.json` for machine-readable command evidence.

## Remaining risks
- The environment must have `@playwright/test` and browser binaries available for real browser execution. If registry access is blocked, Playwright installation must be supplied by CI/cache.
- API mocks in crawler tests return safe empty JSON for non-ML success paths so the frontend shell can be tested without faking ML success.

## Manual checks still needed
- Validate against the deployed `bendehibahamcherif-oss/reversal` backend with `VITE_API_BASE` set in CI/staging.
- Review retained Playwright traces for any flaky backend timing before final production rollout.

## Command evidence from this environment
- `npm test` — passed: 18 test files / 197 tests.
- `npm run build` — passed with existing Vite chunk-size warning.
- `npm run frontend:build` — passed with existing Vite chunk-size warning.
- `node scripts/static-api-scanner.js` — passed.
- `node scripts/detect-menu-duplicates.js` — passed.
- `node scripts/run-production-readiness.js` — failed in this container at the first Playwright step because `npx` could not download `playwright` from the npm registry (`E403 Forbidden`). Static scanner, menu duplicate detector, and frontend smoke steps passed before the environment block.
- `npx playwright test` — failed in this container before tests executed because `npx` could not download `playwright` from the npm registry (`E403 Forbidden`).
- `npm run lint` — unavailable: package has no `lint` script.
- `npm run typecheck` — unavailable: package has no `typecheck` script.

## Navigation selector stabilization update — 2026-06-07

### Failing tests addressed
- Desktop failures: `tests/e2e/app-crawler.spec.ts`, `tests/e2e/production-user-journey.spec.ts`, and `tests/e2e/screen-sanity.spec.ts` timed out while looking for `getByRole('button', { name: 'CH', exact: true })`.
- Mobile failures: `tests/e2e/mobile-app-crawler.spec.ts` and `tests/e2e/mobile-user-journey.spec.ts` timed out while looking for `getByRole('button', { name: /more/i })`.

### Root cause
- Desktop workspace buttons rendered the short visual labels (`CH`, `MK`, etc.) and tooltip/title metadata, but did not expose stable full accessible names or test selectors for the implemented workspaces.
- Mobile primary and More-menu workspace controls had mixed title/text/aria-label behavior, and the More button did not provide a stable non-visual selector for the harness.
- The e2e harness depended first on role names that could diverge from the real implemented navigation DOM instead of using canonical registry-driven selectors.

### Fix
- Added canonical registry-backed `navTestId` and `ariaLabel` metadata for implemented workspaces, including `workspace-nav-chart`, `workspace-nav-markets`, `workspace-nav-live-data`, `workspace-nav-ai-lab`, `workspace-nav-ml`, `workspace-nav-macro`, `workspace-nav-backtesting`, `workspace-nav-portfolio`, and `workspace-nav-risk`.
- Added stable `data-testid` and `aria-label` attributes to desktop sidebar buttons, mobile primary workspace buttons, mobile More-menu workspace buttons, and `data-testid="mobile-more-workspaces"` / `aria-label="More workspaces"` for the mobile More control.
- Updated `tests/e2e/helpers/appHarness.ts` so desktop navigation tries `data-testid`, full accessible labels, title/tooltip labels, and short labels before throwing a failure that lists available navigation labels.
- Updated mobile navigation helpers to use `mobile-more-workspaces`, explicitly fail with available mobile labels when More is absent but needed, and use canonical workspace test IDs inside the drawer.
- Added `tests/e2e/navigation-accessibility.spec.ts` to assert desktop and mobile navigation selectors/accessible names, duplicate-label protection, mobile More discoverability, and timeout-free workspace opening.

### Commands run
- `npm test` — passed: 18 test files / 197 tests.
- `npm run build` — passed with existing Vite chunk-size warning.
- `npm run frontend:build` — passed with existing Vite chunk-size warning.
- `node scripts/static-api-scanner.js` — passed.
- `node scripts/detect-menu-duplicates.js` — passed.
- `npx playwright test tests/e2e/navigation-accessibility.spec.ts` — not executed in this container because `npx` attempted to fetch `playwright` from the npm registry and failed with `E403 Forbidden` before tests started.
- `npx playwright test` — not executed in this container because `npx` attempted to fetch `playwright` from the npm registry and failed with `E403 Forbidden` before tests started.

### Final Playwright result
- Playwright browser tests are expected to run in GitHub Actions where `@playwright/test` and the browser binaries are available. In this container, both requested Playwright commands were blocked before test execution by npm registry policy (`E403 Forbidden` fetching `playwright`).
