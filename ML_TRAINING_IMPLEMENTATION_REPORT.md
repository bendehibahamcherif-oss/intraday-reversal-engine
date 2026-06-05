# ML Training Implementation Report

## 1. Why training was failing
Training failed because `POST /api/ml/train` preferred an older JS training pipeline that required inline candles. The frontend did not provide those candles, and the route did not discover uploaded/generated snapshots. The Python fallback was not reliably reached and expected an already-labeled feature snapshot with unavailable dependencies.

## 2. Dataset expected
Training now accepts CSV or Parquet snapshots with at least:

- `timestamp`
- `symbol`
- `open`
- `high`
- `low`
- `close`
- `volume`

Optional engineered features are consumed when present. Missing P1 features are computed from OHLCV without future leakage.

Default discovery paths:

1. `server/ai/data/features_snapshot.parquet`
2. `server/ai/data/features_snapshot.csv`
3. `data/features_snapshot.parquet`
4. `data/features_snapshot.csv`
5. `datasets/features_snapshot.parquet`
6. `datasets/features_snapshot.csv`

If none exists, the API returns `dataset_missing` JSON with `expectedPaths`.

## 3. Training script added/modified
Added a standalone minimal real Python training script at `server-deliverables/ai/train_pipeline.py` with a compatibility entrypoint at `server/ai/train_pipeline.py`.

The script:

- Loads CSV without third-party dependencies.
- Supports Parquet when pandas/pyarrow are installed.
- Validates required OHLCV columns.
- Sorts chronologically and filters by symbol.
- Builds P1 features from historical/current bars only.
- Generates labels using next-open entry and horizon close exit.
- Drops the last horizon rows.
- Uses chronological train/validation/test split with `gap >= horizon` and no shuffle.
- Trains a real softmax logistic-regression baseline in pure Python when sklearn/xgboost are unavailable.
- Computes accuracy, macro F1, log loss, Brier score for LONG, confusion matrix, and class distribution.
- Saves model and metadata artifacts.

## 4. Node wrapper added/modified
Added `server-deliverables/ai/trainingService.js` with a compatibility export at `server/ai/trainingService.js`.

The wrapper:

- Validates `symbol`, `timeframe`, `horizon`, `datasetPath`, and `promote`.
- Discovers default snapshots when `datasetPath` is omitted.
- Spawns the Python script with a configurable timeout (`ML_TRAINING_TIMEOUT_MS`, default 10 minutes).
- Captures stdout/stderr.
- Parses the last JSON line from Python.
- Returns structured JSON for every success or failure.

## 5. Registry implementation
Added `server-deliverables/ai/modelRegistry.js` with a compatibility export at `server/ai/modelRegistry.js`.

The registry is JSON-backed at `server-deliverables/ai/artifacts/registry.json` and supports:

- Register candidate model runs.
- List all runs without requiring a symbol.
- Get current champion or `champion: null`.
- Promote a model to champion and archive the previous champion.

Endpoints implemented/updated:

- `GET /api/ml/model-runs`
- `GET /api/ml/model`
- `POST /api/ml/promote/:modelId`
- Backward-compatible `POST /api/ml/models/:version/promote`
- `POST /api/ml/train` with optional `promote: true`

## 6. Artifacts generated
Each successful training run writes:

- `server-deliverables/ai/artifacts/<model_id>/model.json`
- `server-deliverables/ai/artifacts/<model_id>/manifest.json`
- `server-deliverables/ai/artifacts/<model_id>/metrics.json`
- `server-deliverables/ai/artifacts/<model_id>/feature_schema.json`
- `server-deliverables/ai/artifacts/<model_id>/model_card.md`
- `server-deliverables/ai/artifacts/<model_id>/train_report.json`

The committed registry starts empty; generated model directories are runtime artifacts and should be produced by training.

## 7. Tests added
Added backend route tests in `src/test/mlTrainingPipeline.test.js`:

1. No dataset returns `dataset_missing` JSON.
2. Synthetic CSV trains a real model and records a registry run.
3. Model endpoint returns `champion: null` before promotion.
4. Promote endpoint sets champion.
5. Invalid train requests return JSON.

Added Python tests via `server/ai/tests/test_train_pipeline_minimal.py` and `server-deliverables/ai/tests/test_train_pipeline_minimal.py`:

1. Label generation uses `open[t+1]` and drops last horizon rows.
2. Feature builder does not depend on future rows.
3. Chronological split uses no shuffle and enforces horizon gaps.
4. Pipeline trains on synthetic CSV and writes artifacts.

## 8. How to train first model
From the repo root:

```bash
node scripts/create-synthetic-ml-dataset.js datasets/features_snapshot.csv 240
npm run server:start
```

Then call:

```bash
curl -s -X POST http://localhost:3001/api/ml/train \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"SPY","timeframe":"1m","horizon":20,"datasetPath":"datasets/features_snapshot.csv","promote":true}'
```

Check runs and champion:

```bash
curl -s http://localhost:3001/api/ml/model-runs
curl -s http://localhost:3001/api/ml/model
```

If no dataset exists, the train endpoint returns:

```json
{
  "ok": false,
  "status": "dataset_missing",
  "message": "No dataset snapshot found. Generate or upload a dataset before training.",
  "expectedPaths": ["..."]
}
```

## 9. Remaining limitations
- Live feature extraction for inference is still not wired; when a champion exists and no `featureVector` is provided, inference returns `feature_vector_required` JSON.
- Parquet requires pandas/pyarrow in the Python environment; CSV works without third-party Python packages.
- The dependency-free model is a baseline softmax logistic-regression classifier. XGBoost/sklearn integration can be layered on later without changing the dataset/registry contract.
- No layout changes were made.
