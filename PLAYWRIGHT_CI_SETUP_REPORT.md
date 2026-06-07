# Playwright CI Setup Report

## What changed

- Added Playwright test runner packages to the root `devDependencies` so CI installs Playwright during `npm ci` instead of relying on `npx` to download it at test time.
- Added root npm scripts:
  - `npm run e2e` → `playwright test`
  - `npm run e2e:install` → `playwright install --with-deps chromium`
  - `npm run production:readiness` → `node scripts/run-production-readiness.js`
- Updated `package-lock.json` with the locked Playwright packages needed by `npm ci`.
- Added `.github/workflows/playwright-production-readiness.yml` to run the production-readiness checks in GitHub Actions.
- Updated `scripts/run-production-readiness.js` so Playwright specs are launched through the local project script (`npm run e2e -- ...`) instead of `npx playwright ...`.
- Configured Playwright to emit HTML and JSON reports in addition to the list reporter, so CI can upload failure diagnostics and machine-readable results.

## GitHub Actions workflow

The workflow runs on pushes to `main`/`master`, pull requests, and manual dispatch. It performs the required production-readiness sequence:

1. Checks out the repository.
2. Sets up Node.js.
3. Runs `npm ci`.
4. Runs `npx playwright install --with-deps chromium`.
5. Runs `npm test`.
6. Runs `npm run build`.
7. Runs `npm run frontend:build`.
8. Runs `node scripts/static-api-scanner.js`.
9. Runs `node scripts/detect-menu-duplicates.js`.
10. Runs `npx playwright test`.
11. Uploads Playwright reports, traces, screenshots, and test result directories when the workflow fails.
12. Uploads JSON result artifacts on every run.

## Local setup and execution

Run these commands from the repository root:

```bash
npm ci
npx playwright install --with-deps chromium
npm run e2e
```

Equivalent npm-script installer:

```bash
npm run e2e:install
```

## Why this fixes the original failure mode

The previous production-readiness script invoked Playwright via `npx playwright ...`. In locked-down environments, `npx` can attempt an on-demand package download and fail before the browser tests execute. The root package now declares Playwright in `devDependencies`, the lockfile pins the installed package graph, and the production-readiness script invokes the local project binary through `npm run e2e -- ...`.
