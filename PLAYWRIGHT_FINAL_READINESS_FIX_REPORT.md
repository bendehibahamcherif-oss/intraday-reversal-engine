# Playwright Final Readiness Fix Report

## Remaining failures fixed

### 1. Historical Data mobile touch targets

- **Exact 22px button family:** Historical Data icon action buttons.
- **Selector/class/text:** `button.historical-action-button.historical-icon-button`, refresh text `⟳`, `title="Refresh"`; matching dataset delete text `✕`, `title="Remove dataset"`.
- **Measured failure:** GitHub Actions reported a visible Historical Data button height of `22px`, below the previous `24px` assertion floor and below the desired `44px` mobile touch target.
- **Root cause:** The refresh/delete icon actions used compact inline padding (`2px 8px` / `1px 6px`) on top of the compact shared `S.btn` style. The previous broad fix was not strict enough at the exact Historical Data icon-button family and did not improve test diagnostics.
- **Fix:** Added Historical Data-only mobile rules for `button`, `[role="button"]`, `.historical-action-button`, `.dataset-action-button`, `.dataset-table button`, and `.dataset-detail-card button`. Normal buttons now get `min-height: 44px`, adequate vertical padding, `inline-flex`, centered content, `box-sizing: border-box`, and `line-height: normal`; icon buttons also get `min-width: 44px`.

### 2. Historical Data long detail field containment

- **Exact overflowing field family:** Dataset detail long text after selecting `e2e-dataset`.
- **Selector/class/text preview:** `.dataset-detail-card` / `.historical-table-wrap` containing `td.historical-long-text` values such as `e2e-dataset...` and `/data/historical...` CSV/path fields.
- **Root cause:** Long unbroken dataset IDs and file/path-like values were nested inside flex/table/detail containers that did not consistently enforce `min-width: 0`, `max-width: 100%`, or path-specific pre-wrapping/inner scrolling on every descendant.
- **Fix:** Added scoped Historical Data containment across descendants, path/JSON/status/toast long-text classes, mobile single-column grid rows, constrained detail card/table wrappers, and `overflow-wrap: anywhere` / `word-break: break-word` / `white-space: pre-wrap` for path-like fields.

## Test/spec improvements without weakening thresholds

- The Historical Data button test now audits only buttons inside `.historical-data-workspace` and requires `44px` height for every visible Historical Data button.
- If a button fails again, the assertion prints the exact label, class, and measured height.
- The long-field test now records every overflowing Historical Data descendant with tag, class, text preview, scroll/client width, x/width, and viewport width.
- The long-field test now explicitly checks both document and body horizontal overflow against the `+1px` tolerance.

## Validation result

| Command | Result |
|---|---|
| `npx playwright test tests/e2e/historical-mobile-layout.spec.ts --reporter=line` | Environment-blocked before assertions: Playwright Chromium executable is missing at `/root/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell`. |
| `npm test` | Passed: 21 test files, 247 tests. |
| `npm run build` | Passed with existing Vite warnings about mixed dynamic/static import of `aiLabStore.js` and chunk size over 500 kB. |
| `npm run frontend:build` | Passed with the same existing Vite warnings. |
| `node scripts/static-api-scanner.js` | Passed: 146 files scanned. |
| `node scripts/detect-menu-duplicates.js` | Passed: 19 workspaces. |
| `npx playwright test --reporter=line` | Environment-blocked for browser-backed tests by the missing Playwright Chromium executable; non-browser/API metadata specs completed before browser launch failures. Result: 4 passed, 2 skipped, 28 browser-launch failures. |
| `npx playwright install chromium` | Environment-blocked by HTTP `403 Forbidden` from the Playwright CDN. |
| `PLAYWRIGHT_DOWNLOAD_HOST=https://playwright.azureedge.net npx playwright install chromium` | Environment-blocked by HTTP `403 Forbidden` from the alternate Playwright CDN host. |
