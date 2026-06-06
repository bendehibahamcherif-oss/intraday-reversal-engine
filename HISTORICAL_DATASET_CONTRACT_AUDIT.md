# Historical Dataset Contract Audit

## Backend response shapes before fix

### POST `/api/historical/download`
The download service returned top-level fields only:

```json
{
  "ok": true,
  "jobId": "...",
  "status": "completed",
  "provider": "yahoo",
  "symbols": ["NFLX"],
  "timeframe": "1d",
  "startDate": "2021-06-07",
  "endDate": "2026-06-05",
  "session": "RTH",
  "rowCount": 1234,
  "rowsBySymbol": { "NFLX": 1234 },
  "files": { "csv": "...", "json": null },
  "datasetId": "hist_NFLX_1d_RTH_20210607_20260605_yahoo",
  "warnings": []
}
```

There was no guaranteed nested `dataset` object, no guaranteed `id` alias, and old registry records could be missing `datasetId`.

### GET `/api/historical/datasets`
The registry returned raw `datasets.json` records:

```json
{
  "ok": true,
  "datasets": [
    { "datasetId": "...", "symbols": ["NFLX"], "rowCount": 1234, "files": { "csv": "..." } }
  ]
}
```

Raw records could omit `datasetId`, `id`, `symbols`, `rowCount`, `rowsBySymbol`, `files`, and `warnings`.

### GET `/api/historical/datasets/:datasetId`
The route returned a raw registry record or an error object with a non-canonical error code:

```json
{ "ok": true, "dataset": { "datasetId": "..." } }
```

Before fix, not found was `{ ok:false, error:{ code:"DATASET_NOT_FOUND", message:"Dataset '...' not found." } }` instead of the standardized `dataset_not_found` contract.

## Frontend expectations before fix

### Historical detail object
The detail screen expected:

```js
{
  datasetId,
  symbols,
  timeframe,
  startDate,
  endDate,
  provider,
  session,
  purpose,
  rowCount,
  status
}
```

It did not display `Dataset ID` as a labeled row and did not render `rowsBySymbol`, `files.csv`, or `warnings`.

### Field used by “Use for ML Training”
The button called `onUseForML(dataset.datasetId)`. If a record only had `id`, the action dispatched `datasetId: undefined`.

### Field used by “Use for Backtesting”
The button called `onUseForBacktest(dataset.datasetId)`. It had the same `id`/`datasetId` mismatch risk.

### Field used by “Use for Correlation”
The button called `onUseForCorrelation(dataset.datasetId)`. It had the same `id`/`datasetId` mismatch risk.

## Payloads before fix

### ML train payload before fix
AILab called `api.trainMLModel(symbol, config)` without any selected historical dataset id:

```json
{
  "symbol": "SPY",
  "horizon": 10,
  "limit": 50,
  "modelType": "xgboost",
  "nEstimators": 200,
  "maxDepth": 5,
  "learningRate": 0.1
}
```

The P1 ML store could include `datasetId`, but AILab was not wired to the Historical Data event.

### Backtest payload before fix
Quant Lab queued only a raw event id and `api.runBacktest` sent:

```json
{
  "strategyId": "...",
  "timeframe": "1d",
  "datasetId": "maybe-present"
}
```

The backend `/api/backtest` route was not mounted in the server entry point.

### Correlation payload before fix
Macro store sent:

```http
GET /api/multi-asset/correlation?symbols=NFLX,SPY&window=20&timeframe=1d&datasetId=maybe-present
```

Beta did not accept or forward `datasetId` from the frontend.

## Root causes

1. `Dataset "undefined"` came from actions using `dataset.datasetId` directly instead of a canonical helper that falls back to `dataset.id`.
2. `dataset_missing` after selection came from AILab not persisting the selected historical dataset id and not including `datasetId` in `POST /api/ml/train`.
3. `symbol_required` came from contract drift between the canonical `symbols` array and legacy single-symbol usage, plus insufficient normalization/deduping guarantees.
4. `id`/`datasetId` mismatch: backend registry could read old records with only `id`; frontend buttons expected only `datasetId`.
5. `symbol`/`symbols` mismatch: historical download needed to accept canonical `symbols: string[]` and legacy `symbol: string`, normalize both, and reject only after normalization.
6. Correlation/Beta NaN risk came from numeric computations over insufficient or unaligned returns without a JSON sanitizer and without converting invalid numeric results to `null`.
