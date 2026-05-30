# Phase 13 Backend Integration

Copy these files into the `reversal` backend repo, then wire in the route.

## Files to copy

```
server-deliverables/multiAsset/multiAssetEngine.js  →  server/multiAsset/multiAssetEngine.js
server-deliverables/api/multiAssetRoutes.js          →  server/api/multiAssetRoutes.js
```

## Route registration

In `server/bootstrap/runtimeIntegration.js`, add:

```js
const multiAssetRoutes = require('../api/multiAssetRoutes');
// ... existing route mounts ...
app.use('/api/multi-asset', multiAssetRoutes);
```

## API contract

| Method | Path | Query params | Response |
|--------|------|-------------|----------|
| GET | `/api/multi-asset/correlation` | `symbols`, `window`, `timeframe` | `{ symbols, matrix[][], window, timeframe, computedAt }` |
| GET | `/api/multi-asset/beta` | `symbol`, `benchmark`, `window`, `timeframe` | `{ symbol, benchmark, beta, r2, window, timeframe, computedAt }` |
| GET | `/api/multi-asset/sector-rotation` | `window`, `timeframe` | `{ sectors[{ symbol, name, return, vol, rank }], window, timeframe, computedAt }` |
| GET | `/api/multi-asset/volatility` | `symbols`, `window`, `timeframe` | `{ volatility[{ symbol, vol, annualizedVol, return }], window, timeframe, computedAt }` |

## Smoke test addition

Add to `server/smoke.cjs` after existing checks:

```js
await check('/api/multi-asset/sector-rotation?window=20');
```

## Computation methods

- **Log returns**: `ln(close_t / close_{t-1})` — avoids compounding distortion
- **Correlation**: Pearson on log returns; returns `null` when either series has zero variance (numerically stable)
- **Beta**: `cov(asset, benchmark) / var(benchmark)`; R² = corr²; `null` when benchmark has zero variance
- **Volatility**: rolling sample σ(log returns) × √252 for annualized figure
- **Sector rotation**: cumulative return from window-start close; ranked descending = momentum signal

## Validation checklist

- [x] Zero-variance guard: `pearsonCorrelation` returns `null` when denom < 1e-12
- [x] Beta returns `null` (not NaN/Infinity) when benchmark is flat
- [x] Sector rotation ranks are consistent — same window → deterministic order
- [x] Diagonal of correlation matrix is always `1` (handled in `computeCorrelationMatrix`)
- [x] All numeric outputs clamped: corr ∈ [−1, 1] via `Math.max(-1, Math.min(1, ...))`
