# Multi-Asset Analytics Dataset Calculation Fix Report

## Root Cause

All four Multi-Asset Analytics panels (Correlation Matrix, Rolling Beta, Sector Rotation, Volatility Heatmap) displayed empty or missing data when a historical dataset was selected in the Macro workspace.

Six specific root causes identified and resolved:

### 1. Missing symbol detection — all four endpoints
When a user selected a dataset containing only `SPY` but requested `SPY,NFLX` correlation, the backend silently computed with whatever symbols were available (or returned an empty matrix when alignment produced 0 rows). The user received a blank panel with no explanation.

**Fix**: `detectMissingSymbols(candles, symbols)` is called before any computation. If symbols are absent from the dataset, the endpoint returns HTTP 200 with `{ ok: false, status: 'missing_symbols', missingSymbols, availableSymbols, message }` — a structured, actionable error that the frontend renders as an informative message.

### 2. Correlation `not_enough_data` triggered on null cells, not on observation count
The old check `if (matrix.some(row => row.some(v => v === null)))` treated any null correlation cell as "not enough data" and returned `matrix: []`. This was incorrect — sparse matrices with valid diagonal cells are normal. The only meaningful threshold is whether the aligned observation count is below the window.

**Fix**: `not_enough_data` is returned only when `observations < 2`. Valid matrices (including cells that may be null for unaligned pairs) are returned as-is.

### 3. Sector rotation always used hardcoded ETF proxies, ignored datasetId
When a datasetId was selected, sector rotation still fetched live ETF price data instead of using the dataset. When non-ETF symbols like `SPY,NFLX` were provided, the ETF rotation calculation produced meaningless results.

**Fix**: If `datasetId` is provided, or if any requested symbol is not in the canonical sector ETF list (`XLK,XLF,XLV,XLE,XLI,XLY,XLC,XLU,XLB,XLRE`), the endpoint returns `{ ok: true, status: 'not_available', reason: 'sector_metadata_missing' }`. The frontend renders an informative panel explaining which ETF symbols are required.

### 4. Volatility heatmap had no dataset-backed path
`/api/multi-asset/volatility-heatmap` had no code path for `datasetId`. It always fetched live prices, so selecting a historical dataset had no effect.

**Fix**: When `datasetId` is present, the endpoint loads candles from the registry file, detects missing symbols, computes log returns per symbol, and calls `annualizedVol(returns.map(r => r.value), window)` — passing the numeric array, not the raw `{timestamp, value}` objects.

### 5. `annualizedVol` received objects instead of numbers
The returns helper `returnsBySymbol(candles, symbol)` returns `[{timestamp, value}]` objects. The old volatility code passed these directly to `annualizedVol` which expected `number[]`, producing `NaN` for all vol values.

**Fix**: All call sites now use `.map(r => r.value)` before passing to `annualizedVol`.

### 6. Frontend did not pass `datasetId` to sector rotation and volatility API calls
`getMultiAssetSectorRotation` and `getMultiAssetVolatility` in `src/api.js` did not accept or forward a `datasetId` parameter. The store likewise did not pass `correlationDatasetId` to these two loaders.

**Fix**: Both API functions updated to accept and forward `datasetId`. Both store loaders (`loadSectorRotation`, `loadVolatility`) now pass `correlationDatasetId`.

---

## Files Changed

### Backend
| File | Change |
|------|--------|
| `server-deliverables/api/multiAssetRoutes.js` | Complete rewrite: `detectMissingSymbols`, `missingSymbolsResponse`, SECTOR_ETF_SYMBOLS set, dataset-backed volatility, sector_metadata_missing response, fixed correlation observations check, status: 'ok' fields |

### Frontend
| File | Change |
|------|--------|
| `src/api.js` | `getMultiAssetSectorRotation` + `getMultiAssetVolatility` accept and forward `datasetId` |
| `src/store/macroStore.js` | `loadSectorRotation` + `loadVolatility` pass `correlationDatasetId` |
| `src/workspaces/MacroWorkspace.jsx` | All 4 panels handle `missing_symbols`, `not_enough_data`, `sector_metadata_missing`/`not_available`; VolatilityHeatmap uses `items_raw` variable correctly |

### Tests
| File | Change |
|------|--------|
| `src/test/multiAssetDatasetCalculation.test.js` | NEW — 14 integration tests covering all 4 endpoints with fixture CSV datasets |
| `src/test/historicalDatasetContractEndToEnd.test.js` | Updated tiny dataset fixture to include both SPY+NFLX rows (1 each) so `not_enough_data` is returned instead of `missing_symbols` |

---

## Response Shapes

### Correlation — success
```json
{
  "ok": true,
  "status": "ok",
  "datasetId": "hist_SPY_1d_...",
  "symbols": ["SPY", "NFLX"],
  "window": 20,
  "observations": 60,
  "matrix": [[1.0, 0.73], [0.73, 1.0]],
  "pairs": [{"a": "SPY", "b": "NFLX", "correlation": 0.73}]
}
```

### Correlation — missing symbols
```json
{
  "ok": false,
  "status": "missing_symbols",
  "message": "Dataset does not contain all requested symbols. Missing: NFLX. Available in dataset: SPY. ...",
  "datasetId": "hist_SPY_1d_...",
  "requestedSymbols": ["SPY", "NFLX"],
  "availableSymbols": ["SPY"],
  "missingSymbols": ["NFLX"]
}
```

### Correlation — not enough data
```json
{
  "ok": false,
  "status": "not_enough_data",
  "message": "...",
  "observations": 0,
  "window": 20,
  "matrix": []
}
```

### Beta — success
```json
{
  "ok": true,
  "status": "ok",
  "symbol": "NFLX",
  "benchmark": "SPY",
  "window": 20,
  "beta": 1.23,
  "r2": 0.68,
  "series": [...]
}
```

### Volatility — success
```json
{
  "ok": true,
  "status": "ok",
  "volatility": [
    {"symbol": "NFLX", "vol": 0.312, "cumReturn": 0.18},
    {"symbol": "SPY",  "vol": 0.155, "cumReturn": 0.09}
  ]
}
```

### Sector rotation — not available for non-ETF symbols
```json
{
  "ok": true,
  "status": "not_available",
  "reason": "sector_metadata_missing",
  "message": "Sector rotation requires sector ETF symbols (XLK, XLF, ...). Your symbols: SPY, NFLX.",
  "symbols": ["SPY", "NFLX"]
}
```

---

## Test Results

```
Test Files  19 passed (19)
Tests       219 passed (219)
Build       ✓ built in 1.94s
Static API scanner: passed (145 files)
Menu duplicate detector: passed (33 workspaces)
```

---

## Non-Negotiable Constraints Verified

- No fake calculations — all numbers derived from actual CSV price data
- No static demo analytics — dataset must be selected; fallback_demo is not used as source
- Missing data shown explicitly — `missing_symbols` with named symbols, `not_enough_data` with observation count
- No NaN/Infinity in any response — `sanitizeJson` replaces both with null throughout
- All symbols computed — detection fires for each requested symbol, not just first
- API keys never logged — dataset loading uses file paths from registry only
- Credentials never in frontend localStorage — no change to credential flow
- UI layout/colors/spacing unchanged — only panel content for error states added
- No path traversal — dataset file resolution uses `path.resolve` + prefix check from existing registry logic
