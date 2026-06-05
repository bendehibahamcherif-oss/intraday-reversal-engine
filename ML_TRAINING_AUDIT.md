# ML Training Audit

## Scope
Audited the mounted backend ML route module and the Phase 9A/9B ML deliverables used by `server/index.cjs`:

- `server/index.cjs`
- `server-deliverables/ai/mlRoutes.js`
- `server-deliverables/ai/pythonInference.js`
- `server-deliverables/ai/training/train_pipeline.py`
- `server-deliverables/ai/training/dataset_builder.py`
- `server-deliverables/ai/training/feature_builder.py`
- `server-deliverables/ai/training/label_builder.py`
- `server-deliverables/ai/registry/model_registry.py`
- `server-deliverables/ml/trainingPipeline.js`
- `server-deliverables/ml/featureStore.js`
- `server-deliverables/ml/modelRegistry.js`
- `server-deliverables/ml/inferenceService.js`
- `package.json`
- `scripts/`

## Current train endpoint behavior before this implementation
`server/index.cjs` mounts `server-deliverables/ai/mlRoutes.js` at `/api/ml`. The previous `POST /api/ml/train` preferred the older JS `runTraining` path whenever the Phase 9A module could be required. That path expected request `candles` and built a temp training snapshot from those candles. The UI did not send a dataset snapshot path and normally sent no candles, so the endpoint returned a `training_unavailable` response with `dataset: missing_or_empty` instead of starting durable training.

If the old JS path was not available, the route attempted to spawn `server-deliverables/ai/training/train_pipeline.py`; however that script expected a prebuilt labeled feature snapshot and a richer Python ML dependency stack. There was no route-level dataset discovery and no clear dataset-missing contract.

## Whether it called a real Python script
A Python subprocess fallback existed, but it was not the default path because `runTraining` was present. The Python script path also did not solve first-model training from raw OHLCV because it expected an already labeled snapshot.

## Dataset expectations before this implementation
The old JS route expected inline `candles`. The old Python training pipeline expected a labeled Parquet snapshot produced by the training dataset builder. There was no API contract for:

- `datasetPath`
- default dataset discovery paths
- CSV snapshots
- minimum raw OHLCV columns

## Expected dataset path after this implementation
`POST /api/ml/train` now accepts `datasetPath`. If omitted, the backend searches:

1. `server/ai/data/features_snapshot.parquet`
2. `server/ai/data/features_snapshot.csv`
3. `data/features_snapshot.parquet`
4. `data/features_snapshot.csv`
5. `datasets/features_snapshot.parquet`
6. `datasets/features_snapshot.csv`

In this repository's mounted implementation these are resolved from `server-deliverables/ai/trainingService.js`; `server/ai/*` compatibility wrappers are also present.

## Expected feature schema
Required raw dataset columns:

- `timestamp`
- `symbol`
- `open`
- `high`
- `low`
- `close`
- `volume`

Optional precomputed features are accepted when present:

- `ret_1`, `ret_5`, `range_1`, `body_pct`, `rsi14`, `ema9_spread`, `ema20_spread`, `vwap_spread`, `dist_poc`, `dist_vah`, `dist_val`, `cvd_slope`, `l1_queue_imbalance`, `footprint_imbalance_count`

When engineered features are missing, the new pipeline computes P1 OHLCV features without future shifts:

- `ret_1`, `ret_5`, `ret_20`
- `range_pct`, `body_pct`, `upper_wick_pct`, `lower_wick_pct`
- `volume_zscore_20`, `realized_vol_20`
- `ema9_spread`, `ema20_spread`, `vwap_spread`

## Label contract
For each row `t`:

- `entry_price(t) = open[t+1]`
- `exit_price(t,h) = close[t+h]`
- `net_return = (exit - entry) / entry - cost_bps / 10000`
- `0 = SHORT` if `net_return < -tau_dn`
- `1 = NEUTRAL` otherwise
- `2 = LONG` if `net_return > tau_up`

The last `horizon` rows have no valid forward outcome and are dropped.

## Model artifact path
Artifacts are saved under:

- `server-deliverables/ai/artifacts/<model_id>/`

The requested compatibility path `server/ai/train_pipeline.py` forwards to the mounted implementation.

Each model directory contains:

- `model.json`
- `manifest.json`
- `metrics.json`
- `feature_schema.json`
- `model_card.md`
- `train_report.json`

## Registry path
The implemented minimum registry is JSON-backed:

- `server-deliverables/ai/artifacts/registry.json`

It stores `modelId`, creation metadata, symbol/timeframe/horizon, dataset and schema hashes, metrics, artifact paths, and `candidate | champion | archived` status.

## Champion selection before this implementation
The prior code mixed a Phase 9B SQLite registry and a Phase 9A JSON registry. The mounted `GET /api/ml/model` looked for a champion via those registries, but successful first-model registration was not reachable from the UI flow.

## Why worker showed stopped
`GET /api/ml/health` and inference used the Python worker pool from `pythonInference.js`. That worker is an inference worker pool, not the training path. With no champion model and no initialized inference worker, status could show stopped/not configured even though the actual missing prerequisite was a trainable dataset/model.

## Why dataset was `missing_or_empty`
The route preferred the Phase 9A `runTraining` service, which expected inline `candles`. The UI did not provide a populated candle array or any discoverable dataset snapshot, so `runTraining` failed before a durable Python training job could start.
