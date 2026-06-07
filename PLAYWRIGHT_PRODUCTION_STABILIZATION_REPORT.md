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

## App shell boot stabilization update — 2026-06-07

### Artifact inspection
- The requested GitHub Actions artifacts (`test-results/app-crawler-*/test-failed-1.png`, `test-results/navigation-accessibility-*/test-failed-1.png`, `test-results/mobile-app-crawler-*/test-failed-1.png`, `error-context.md`, and `trace.zip`) were not present in this checkout, so the local investigation proceeded from the repository test helpers, mounted components, and the failure evidence supplied in the mission.

### Why `Available navigation labels: (none)` happened
- The actual app root is `src/main.jsx`, which mounts `src/App.jsx` directly into `#root`; there is no separate router/root shell in this repo.
- `App.jsx` first checks the cached token/user and then calls `api.me()` before rendering the terminal shell. The e2e harness only mocked `**/api/**`, while the real API client calls `/auth/me` (without the `/api` prefix). In Playwright this left the auth check outside the safe mocks, caused the app to fall back to the auth gate, and meant the crawler selector `aside button, nav button, [role="dialog"] button` saw no workspace navigation buttons at all.
- The previous selector additions landed on real components (`TerminalSidebar.jsx` and `MobileBottomNav.jsx`), but the Playwright boot path was not reliably reaching those mounted components because the auth boot request was not mocked.

### Actual DOM / screenshot finding
- No local retained screenshot/trace artifact was available in this checkout. Static inspection of the mounted app path shows that successful desktop boot renders `App.jsx` → `TerminalSidebar.jsx`, while successful mobile boot renders `App.jsx` → `MobileBottomNav.jsx` at the `window.innerWidth < 768` breakpoint.
- The shell/nav absence described by CI is therefore consistent with the auth gate/loading boot branch, not with a desktop/mobile selector spelling problem.

### Actual mounted shell/nav component
- Desktop shell: `src/App.jsx` renders the top-level terminal container and mounts `src/TerminalSidebar.jsx` for workspace navigation.
- Mobile shell: `src/App.jsx` renders the top-level terminal container and mounts `src/components/terminal/MobileBottomNav.jsx` for primary and More workspace navigation.
- `src/AuthGate.jsx` remains a real login gate for non-authenticated runtime use, but e2e boot now bypasses it via safe mocked `/auth/*` responses and pre-seeded local storage.

### Root cause
- `bootApp` seeded local storage but did not wait for the actual terminal shell/nav markers.
- `installSafeApiMocks` did not intercept the real `/auth/me` boot request made by `api.me()`, so Playwright could render the auth gate instead of the terminal shell.
- Mobile specs relied on project viewport configuration, but the harness did not offer a pre-`goto()` viewport path for mobile callers.

### Fix
- Added non-visual permanent `data-testid="terminal-shell"`, `data-testid="desktop-workspace-nav"`, and `data-testid="mobile-workspace-nav"` markers to the actual mounted shell/sidebar/mobile nav components; `mobile-more-workspaces` remains on the actual mobile More button.
- Extended e2e safe mocks to cover `/auth/me`, `/auth/check`, `/auth/login`, and `/auth/register` without weakening `/api` network guards.
- Updated `bootApp` to optionally set viewport before `page.goto('/')`, wait for `terminal-shell`, then wait for either desktop or mobile nav.
- Added boot/navigation diagnostics that write to `APP_CRAWLER_RESULTS.json` and include current URL, document title/readiness, body text/HTML previews, all buttons, all data-testid elements, nav/aside/dialog elements, and shell/nav marker booleans in thrown errors.
- Updated navigation accessibility tests to assert the terminal shell and expected desktop/mobile nav container before checking workspace buttons.

### Final commands and result
- `npm install` — failed in this environment because registry policy blocked `playwright-core@1.56.1` with `E403 Forbidden`; existing cached dependencies were still sufficient for Vitest and Vite.
- `npm test` — passed: 18 test files / 197 tests.
- `npm run build` — passed with the existing Vite dynamic-import and chunk-size warnings.
- `npm run frontend:build` — passed with the existing Vite dynamic-import and chunk-size warnings.
- `node scripts/static-api-scanner.js` — passed.
- `node scripts/detect-menu-duplicates.js` — passed.
- `npx playwright test tests/e2e/navigation-accessibility.spec.ts` — blocked before test execution because `npx` attempted to fetch `playwright` and npm returned `E403 Forbidden`.
- `npx playwright test` — blocked before test execution because `npx` attempted to fetch `playwright` and npm returned `E403 Forbidden`.

## API harness and workspace label stabilization update — 2026-06-07

### Previous shell/nav issue
- The prior stabilization work fixed the shell boot path by seeding auth state, mocking `/auth/*`, waiting for `terminal-shell`, and targeting the real desktop/mobile navigation markers before opening workspaces.
- Current failures therefore moved past selector/shell boot problems and into API contract handling and canonical workspace metadata mismatches.

### New root cause
- Playwright CI starts only the Vite frontend web server from `playwright.config.ts`; it does not start the backend API server bound to `http://127.0.0.1:10000`.
- The real app shell boots the default Chart workspace, which immediately calls chart, volume-profile, CVD, provider, and feed endpoints through `VITE_API_BASE`.
- The previous e2e mock layer returned broad safe JSON for some `/api` groups but did not provide contract-shaped responses for chart/feed polling endpoints.
- Workspace transitions can cancel in-flight GET polling/data requests. Those cancellations are legitimate only when the request was already matched by a deterministic e2e mock, is a GET chart/feed/provider polling request, has no `undefined`/`null`/`NaN` URL token, and is not a stale/forbidden endpoint.
- Mobile and desktop journey tests mixed hardcoded labels with the registry. `Macro / Multi-Asset` is the canonical registry label for the dedicated `MacroMultiAsset` workspace, while `Settings / More` is mobile-only (`desktopVisible: false`) and the desktop canonical workspace is `Operations`.

### Deterministic API endpoints mocked
- Chart/feed: `GET /api/chart/payload/:symbol`, `GET /api/chart/cvd/:symbol`, `GET /api/volume-profile/:symbol`, `GET /api/feeds/tick/:symbol`, `GET /api/feeds/candle/:symbol`, `GET /api/feeds/orderbook/:symbol`, `GET /api/feed/status`, and `GET /api/feeds/status`.
- Providers/historical: `GET /api/providers/health`, `GET /api/providers/credentials`, `GET /api/providers/active`, `GET /api/historical/providers`, `GET /api/historical/datasets`, dataset detail/diagnostics/delete helpers used by crawled workspaces, and the historical use-for-ML/backtest/correlation POST endpoints.
- ML: `GET /api/ml/dependencies`, `GET /api/ml/model`, `GET /api/ml/model-runs`, `GET /api/ml/predictions`, `GET /api/ml/feature-importance`, `GET /api/ml/drift`, `GET /api/ml/model-card`, `POST /api/ml/train`, `POST /api/ml/infer/:symbol`, and `POST /api/ml/promote/:modelId`.
- Backtest/macro: `POST /api/backtest/run`, `GET /api/backtest/runs`, `GET /api/macro/beta`, `GET /api/macro/correlation`, `GET /api/macro/sector-rotation`, and `GET /api/macro/volatility-heatmap` plus the app's current `/api/multi-asset/*` equivalents.
- Portfolio/risk: `GET /api/portfolio/summary`, `GET /api/portfolio/positions`, `GET /api/portfolio/pnl`, `GET /api/portfolio/exposure`, `GET /api/portfolio/drawdown`, `GET /api/portfolio/history`, `GET /api/risk/summary`, `GET /api/risk/limits`, `GET /api/risk/var`, `GET /api/risk/drawdown`, `GET /api/risk/exposure`, and `GET /api/risk/alerts`.
- Additional crawled workspace safe empty states are covered for execution, OMS, ops, institutional, rules, strategy-lab, paper, market, and legacy chart sub-resources so crawler coverage does not depend on a live backend.

### Mock response policy
- All e2e API mocks return `application/json; charset=utf-8` with an `x-e2e-api-mock: true` marker header.
- Unknown `/api` routes return deterministic JSON with HTTP 501, which keeps network guards strict and causes the test to fail as an unmocked API request.
- Chart payload, CVD, volume profile, and feed responses use finite deterministic values only.
- Macro beta/correlation use safe `not_enough_data` empty states with `beta: null` and `r2: null`, never `NaN`.
- Portfolio and risk responses use safe empty states.
- ML model responses report `champion: null`; inference returns `no_champion_model`; training returns `training_unavailable`; provider connectivity and ML success are not faked.

### Network guard updates
- Network guards now classify API traffic as `mocked-response-ok`, `real-response-ok`, `aborted-cancelled-get-polling-request`, `forbidden-aborted-request`, or `unknown-unmocked-api-request`.
- Guards still fail stale ML endpoints, bad URL tokens, bad request bodies, unknown unmocked `/api` requests, 404, 5xx, HTML responses, invalid JSON, empty API bodies, non-JSON content types, and `undefined`/`NaN`/`Infinity` response content.
- `net::ERR_ABORTED` is allowed only for matched deterministic GET polling/data requests and never for POST requests or unknown routes.

### Macro label fix
- The mobile journey now derives required navigation labels from canonical workspace registry IDs via `requiredWorkspaceNavLabels(...)` instead of hardcoding `Macro / Multi-Asset`; this correctly expects the rendered mobile aria label `Macro` for the `MacroMultiAsset` workspace while preserving the visible registry label.
- No duplicate Macro menu item was added and no visual layout/design change was made.

### Settings / More fix
- The desktop production journey no longer requires fake desktop workspace lookup for the mobile-only `Settings / More` entry.
- The desktop journey uses the implemented canonical `Operations` workspace.
- A separate regression validates that `Settings / More` remains present inside the mobile More dialog and is not treated as a desktop workspace.

### Polling cleanup findings
- Chart, CVD, volume-profile, and live feed requests already used `AbortController` for one active request at a time.
- The mounted Chart and Live Data workspaces did not consistently abort pending requests on workspace unmount/route change.
- Cleanup hooks now call store abort methods on unmount, and aborted requests clear loading state without surfacing UI errors.

### Regression tests added
- `tests/e2e/api-mock-coverage.spec.ts` verifies app boot has zero unmocked `/api` requests.
- `tests/e2e/api-mock-coverage.spec.ts` verifies switching from Chart through other workspaces does not create forbidden repeated aborted polling failures.
- `tests/e2e/api-mock-coverage.spec.ts` verifies journey labels are derived from canonical registry metadata.
- `tests/e2e/api-mock-coverage.spec.ts` verifies `Settings / More` separately in the mobile More dialog.

### Final command results from this environment
- `npm test` — passed: 18 test files / 197 tests.
- `npm run build` — passed with existing Vite dynamic-import and chunk-size warnings.
- `npm run frontend:build` — passed with existing Vite dynamic-import and chunk-size warnings.
- `node scripts/static-api-scanner.js` — passed.
- `node scripts/detect-menu-duplicates.js` — passed.
- `npm run e2e -- tests/e2e/navigation-accessibility.spec.ts` — blocked before test execution because local `node_modules` does not include the Playwright binary.
- `npx playwright test tests/e2e/navigation-accessibility.spec.ts` — blocked before test execution because `npx` attempted to fetch `playwright` and npm returned `E403 Forbidden`.
- `npx playwright test tests/e2e/payload-fuzz.spec.ts` — blocked before test execution because `npx` attempted to fetch `playwright` and npm returned `E403 Forbidden`.
- `npx playwright test tests/e2e/storage-fuzz.spec.ts` — blocked before test execution because `npx` attempted to fetch `playwright` and npm returned `E403 Forbidden`.
- `npx playwright test tests/e2e/mobile-user-journey.spec.ts` — blocked before test execution because `npx` attempted to fetch `playwright` and npm returned `E403 Forbidden`.
- `npx playwright test tests/e2e/production-user-journey.spec.ts` — blocked before test execution because `npx` attempted to fetch `playwright` and npm returned `E403 Forbidden`.
- `npx playwright test` — blocked before test execution because `npx` attempted to fetch `playwright` and npm returned `E403 Forbidden`.

### Remaining risks
- CI must provide `@playwright/test`, the `playwright` package, and browser binaries from install/cache before browser tests can run.
- The e2e mocks intentionally validate frontend/backend contracts but do not validate live provider connectivity, ML training success, or production backend availability.
- If new frontend `/api` calls are added, the strict unknown-route guard will fail until a deterministic contract mock is added or the backend is run for that test.
