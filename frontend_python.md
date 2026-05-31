# Phase 9A — Python ML Code Summary

Deux scripts Python dans `server-deliverables/ml/python/`.  
Dépendances : `xgboost`, `numpy`, `scikit-learn`.

---

## 1. `train_xgboost.py`

Script **one-shot** : entraîne un modèle XGBoost 3 classes et sauvegarde les artefacts.

### Lancement

```bash
python3 train_xgboost.py \
  --dataset /tmp/dataset.json \
  --output-dir /tmp/model_output \
  --config '{"eta": 0.05}'
```

### Code complet

```python
#!/usr/bin/env python3
"""
train_xgboost.py — XGBoost multi-class signal training script.

Class mapping (labelSpecVersion: tradable_v1):
  SHORT   = 0
  NEUTRAL = 1
  LONG    = 2
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

import numpy as np
import xgboost as xgb
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    log_loss,
    precision_recall_fscore_support,
)

CLASS_MAPPING = {"SHORT": 0, "NEUTRAL": 1, "LONG": 2}
IDX_TO_CLASS  = {v: k for k, v in CLASS_MAPPING.items()}

DEFAULT_PARAMS = {
    "objective":        "multi:softprob",
    "num_class":        3,
    "eval_metric":      ["mlogloss", "merror"],
    "tree_method":      "hist",
    "eta":              0.05,
    "max_depth":        4,
    "min_child_weight": 5,
    "subsample":        0.8,
    "colsample_bytree": 0.8,
    "reg_lambda":       1.0,
    "seed":             42,
}

DEFAULT_NUM_BOOST_ROUND      = 300
DEFAULT_EARLY_STOPPING_ROUNDS = 30
DEFAULT_HORIZON_BARS          = 5
MIN_SAMPLES                   = 30


def err_exit(message: str) -> None:
    print(json.dumps({"status": "error", "message": message}), flush=True)
    sys.exit(1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train XGBoost signal model.")
    parser.add_argument("--dataset",    required=True, help="Path to dataset JSON file.")
    parser.add_argument("--output-dir", required=True, help="Directory for output artefacts.")
    parser.add_argument("--config", default="{}", help="JSON string of optional hyperparameter overrides.")
    return parser.parse_args()


def load_dataset(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    required = {"X", "y", "feature_names"}
    missing  = required - set(data.keys())
    if missing:
        err_exit(f"Dataset missing keys: {sorted(missing)}")
    return data


def chronological_split(n: int, horizon_bars: int) -> tuple[range, range, range]:
    """70/15/15 split avec gap = horizon_bars entre chaque frontière."""
    train_end  = int(n * 0.70)
    val_end    = int(n * 0.85)
    val_start  = train_end + horizon_bars
    test_start = val_end   + horizon_bars

    if val_start >= val_end or test_start >= n:
        err_exit(
            f"Dataset too small ({n} samples) to apply a "
            f"{horizon_bars}-bar gap with 70/15/15 split."
        )
    return range(0, train_end), range(val_start, val_end), range(test_start, n)


def compute_metrics(y_true: np.ndarray, y_pred_proba: np.ndarray, label: str) -> dict:
    """Accuracy, f1_macro, mlogloss + stats par classe."""
    y_pred    = np.argmax(y_pred_proba, axis=1)
    acc       = float(accuracy_score(y_true, y_pred))
    f1_macro  = float(f1_score(y_true, y_pred, average="macro", zero_division=0))
    logloss   = float(log_loss(y_true, y_pred_proba, labels=[0, 1, 2]))

    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=[0, 1, 2], zero_division=0
    )
    per_class = {
        IDX_TO_CLASS[idx]: {
            "precision": float(precision[idx]),
            "recall":    float(recall[idx]),
            "f1":        float(f1[idx]),
            "support":   int(support[idx]),
        }
        for idx in IDX_TO_CLASS
    }
    class_dist = {IDX_TO_CLASS[i]: int(np.sum(y_true == i)) for i in IDX_TO_CLASS}

    return {
        "accuracy":          acc,
        "f1_macro":          f1_macro,
        "mlogloss":          logloss,
        "perClass":          per_class,
        "classDistribution": class_dist,
    }


def main() -> None:
    args = parse_args()

    try:
        user_config = json.loads(args.config)
    except json.JSONDecodeError as exc:
        err_exit(f"Invalid --config JSON: {exc}")

    horizon_bars          = int(user_config.pop("horizonBars",          DEFAULT_HORIZON_BARS))
    num_boost_round       = int(user_config.pop("num_boost_round",       DEFAULT_NUM_BOOST_ROUND))
    early_stopping_rounds = int(user_config.pop("early_stopping_rounds", DEFAULT_EARLY_STOPPING_ROUNDS))

    params = {**DEFAULT_PARAMS, **user_config}
    seed   = int(params.get("seed", 42))
    np.random.seed(seed)

    # Chargement dataset
    try:
        dataset = load_dataset(args.dataset)
    except FileNotFoundError:
        err_exit(f"Dataset file not found: {args.dataset}")
    except json.JSONDecodeError as exc:
        err_exit(f"Failed to parse dataset JSON: {exc}")

    X_all         = np.array(dataset["X"],            dtype=np.float32)
    y_all         = np.array(dataset["y"],            dtype=np.int32)
    feature_names = list(dataset["feature_names"])
    dataset_hash  = dataset.get("datasetHash", "")

    n_samples = len(y_all)
    if n_samples < MIN_SAMPLES:
        err_exit(f"Dataset has only {n_samples} samples; minimum required is {MIN_SAMPLES}.")
    if X_all.shape[0] != n_samples:
        err_exit("Mismatch between X rows and y length.")

    # Split chronologique
    train_idx, val_idx, test_idx = chronological_split(n_samples, horizon_bars)

    X_train, y_train = X_all[train_idx], y_all[train_idx]
    X_val,   y_val   = X_all[val_idx],   y_all[val_idx]
    X_test,  y_test  = X_all[test_idx],  y_all[test_idx]

    dtrain = xgb.DMatrix(X_train, label=y_train, feature_names=feature_names)
    dval   = xgb.DMatrix(X_val,   label=y_val,   feature_names=feature_names)
    dtest  = xgb.DMatrix(X_test,  label=y_test,  feature_names=feature_names)

    evals_result: dict = {}
    booster = xgb.train(
        params,
        dtrain,
        num_boost_round=num_boost_round,
        evals=[(dtrain, "train"), (dval, "val")],
        evals_result=evals_result,
        early_stopping_rounds=early_stopping_rounds,
        verbose_eval=False,
    )

    best_iteration = int(booster.best_iteration)
    best_score     = float(booster.best_score)

    def predict_proba(booster: xgb.Booster, dmat: xgb.DMatrix) -> np.ndarray:
        raw = booster.predict(dmat, iteration_range=(0, booster.best_iteration + 1))
        return raw.reshape(-1, 3)

    train_metrics = compute_metrics(y_train, predict_proba(booster, dtrain), "train")
    val_metrics   = compute_metrics(y_val,   predict_proba(booster, dval),   "val")
    test_metrics  = compute_metrics(y_test,  predict_proba(booster, dtest),  "test")

    # Feature importance (gain, top 10)
    importance_raw    = booster.get_score(importance_type="gain")
    sorted_importance = sorted(importance_raw.items(), key=lambda kv: kv[1], reverse=True)
    top10_importance  = {k: float(v) for k, v in sorted_importance[:10]}
    full_importance   = {k: float(v) for k, v in importance_raw.items()}

    os.makedirs(args.output_dir, exist_ok=True)
    model_path    = os.path.join(args.output_dir, "model.ubj")
    metrics_path  = os.path.join(args.output_dir, "metrics.json")
    manifest_path = os.path.join(args.output_dir, "manifest.json")

    booster.save_model(model_path)

    with open(metrics_path, "w", encoding="utf-8") as fh:
        json.dump({
            "trainMetrics":     train_metrics,
            "valMetrics":       val_metrics,
            "testMetrics":      test_metrics,
            "featureImportance": full_importance,
            "bestIteration":    best_iteration,
            "bestScore":        best_score,
            "trainSize":        len(y_train),
            "valSize":          len(y_val),
            "testSize":         len(y_test),
        }, fh, indent=2)

    timestamp     = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    model_version = f"xgb_p1_v1_{timestamp}"

    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump({
            "modelVersion":     model_version,
            "featureVersion":   "p1_v1",
            "labelSpecVersion": "tradable_v1",
            "classMapping":     CLASS_MAPPING,
            "datasetHash":      dataset_hash,
            "featureNames":     feature_names,
            "trainMetrics":     {"accuracy": train_metrics["accuracy"], "f1_macro": train_metrics["f1_macro"], "mlogloss": train_metrics["mlogloss"]},
            "valMetrics":       {"accuracy": val_metrics["accuracy"],   "f1_macro": val_metrics["f1_macro"],   "mlogloss": val_metrics["mlogloss"]},
            "testMetrics":      {"accuracy": test_metrics["accuracy"],  "f1_macro": test_metrics["f1_macro"],  "mlogloss": test_metrics["mlogloss"]},
            "bestIteration":    best_iteration,
            "bestScore":        best_score,
            "featureImportance": top10_importance,
            "trainSize":        len(y_train),
            "valSize":          len(y_val),
            "testSize":         len(y_test),
            "createdAt":        datetime.now(timezone.utc).isoformat(),
            "seed":             seed,
        }, fh, indent=2)

    print(json.dumps({
        "status":       "ok",
        "manifestPath": os.path.abspath(manifest_path),
        "modelPath":    os.path.abspath(model_path),
    }), flush=True)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        err_exit(str(exc))
```

---

## 2. `infer_worker.py`

Worker **persistant** — lancé une fois par `inferenceService.js`, tourne en boucle infinie, reçoit des commandes JSON sur stdin et répond sur stdout.

### Protocole newline-delimited JSON

```
[startup]
  ← {"action": "load", "modelPath": "/path/to/model.ubj"}
  → {"status": "ready", "modelPath": "/path/to/model.ubj"}

[predict]
  ← {"action": "predict", "features": [0.001, -0.002, ...11 valeurs...],
      "featureNames": ["ret_1m", "ret_5m", ...], "requestId": "uuid"}
  → {"status": "ok", "requestId": "uuid",
     "class": "LONG",        // SHORT | NEUTRAL | LONG
     "classIndex": 2,        // 0=SHORT, 1=NEUTRAL, 2=LONG
     "probabilities": {"SHORT": 0.10, "NEUTRAL": 0.25, "LONG": 0.65},
     "confidence": 0.65,     // max(probabilities)
     "inferenceMs": 1.23}

[health]
  ← {"action": "health", "requestId": "uuid"}
  → {"status": "ok", "modelLoaded": true, "requestId": "uuid"}

[shutdown]
  ← {"action": "shutdown"}
  → (process exit 0)
```

### Code complet

```python
#!/usr/bin/env python3
"""
infer_worker.py — Persistent XGBoost inference worker.

Protocol: newline-delimited JSON over stdin/stdout.
Class mapping (labelSpecVersion: tradable_v1):
  SHORT = 0 | NEUTRAL = 1 | LONG = 2
"""

import json
import sys
import time

import numpy as np
import xgboost as xgb

CLASS_NAMES = ["SHORT", "NEUTRAL", "LONG"]  # index → class name


def write_json(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def read_json_line() -> dict:
    line = sys.stdin.readline()
    if not line:
        sys.exit(0)  # stdin fermé
    return json.loads(line.strip())


def load_model(model_path: str) -> xgb.Booster:
    booster = xgb.Booster()
    booster.load_model(model_path)
    return booster


def run_predict(
    booster: xgb.Booster,
    features: list,
    feature_names: list,
    request_id: str,
) -> dict:
    t_start = time.perf_counter()

    X    = np.array([features], dtype=np.float32)   # shape (1, 11)
    dmat = xgb.DMatrix(X, feature_names=feature_names)

    raw   = booster.predict(dmat)
    proba = raw.reshape(-1, 3)[0]                    # shape (3,)

    class_index = int(np.argmax(proba))
    class_name  = CLASS_NAMES[class_index]
    confidence  = float(proba[class_index])
    elapsed_ms  = (time.perf_counter() - t_start) * 1000.0

    return {
        "status":        "ok",
        "requestId":     request_id,
        "class":         class_name,
        "classIndex":    class_index,
        "probabilities": {
            "SHORT":   float(proba[0]),
            "NEUTRAL": float(proba[1]),
            "LONG":    float(proba[2]),
        },
        "confidence":  confidence,
        "inferenceMs": round(elapsed_ms, 4),
    }


def main() -> None:
    booster: xgb.Booster | None = None

    # --- Handshake startup ---
    try:
        init_msg = read_json_line()
    except json.JSONDecodeError as exc:
        write_json({"status": "error", "requestId": "", "message": f"Invalid init JSON: {exc}"})
        sys.exit(1)

    if init_msg.get("action") != "load":
        write_json({"status": "error", "requestId": "",
                    "message": f"Expected action='load', got: {init_msg.get('action')}"})
        sys.exit(1)

    model_path = init_msg.get("modelPath", "")
    try:
        booster = load_model(model_path)
        write_json({"status": "ready", "modelPath": model_path})
    except Exception as exc:
        write_json({"status": "error", "requestId": "",
                    "message": f"Failed to load model '{model_path}': {exc}"})
        sys.exit(1)

    # --- Boucle principale ---
    while True:
        try:
            msg = read_json_line()
        except json.JSONDecodeError as exc:
            write_json({"status": "error", "requestId": "", "message": f"Invalid JSON: {exc}"})
            continue

        action     = msg.get("action", "")
        request_id = msg.get("requestId", "")

        if action == "predict":
            features      = msg.get("features")
            feature_names = msg.get("featureNames")

            if features is None or feature_names is None:
                write_json({"status": "error", "requestId": request_id,
                            "message": "Missing 'features' or 'featureNames'."})
                continue

            if len(features) != len(feature_names):
                write_json({"status": "error", "requestId": request_id,
                            "message": f"Length mismatch: features={len(features)}, featureNames={len(feature_names)}"})
                continue

            if booster is None:
                write_json({"status": "error", "requestId": request_id, "message": "Model not loaded."})
                continue

            try:
                write_json(run_predict(booster, features, feature_names, request_id))
            except Exception as exc:
                write_json({"status": "error", "requestId": request_id,
                            "message": f"Prediction failed: {exc}"})

        elif action == "health":
            write_json({"status": "ok", "modelLoaded": booster is not None, "requestId": request_id})

        elif action == "shutdown":
            sys.exit(0)

        else:
            write_json({"status": "error", "requestId": request_id,
                        "message": f"Unknown action: '{action}'"})


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
```

---

## Résumé architecture

```
Node.js (inferenceService.js)
        │
        │  spawn une seule fois
        ▼
infer_worker.py  ◄──stdin── {"action":"predict","features":[...],"requestId":"uuid"}
        │         ──stdout─► {"status":"ok","class":"LONG","confidence":0.65,...}
        │
        └── booster.predict()  ← model.ubj chargé au startup


Node.js (trainingPipeline.js)
        │
        │  spawn one-shot
        ▼
train_xgboost.py  ← --dataset /tmp/ds.json --output-dir /tmp/out
        │
        ├── model.ubj       (artefact XGBoost binaire)
        ├── metrics.json    (métriques détaillées)
        ├── manifest.json   (version + métriques résumées + feature importance)
        └── stdout: {"status":"ok","manifestPath":"...","modelPath":"..."}
```

## Paramètres XGBoost (figés Phase 9A)

| Paramètre | Valeur |
|---|---|
| `objective` | `multi:softprob` |
| `num_class` | `3` |
| `eta` | `0.05` |
| `max_depth` | `4` |
| `min_child_weight` | `5` |
| `subsample` | `0.8` |
| `colsample_bytree` | `0.8` |
| `reg_lambda` | `1.0` |
| `seed` | `42` |
| `num_boost_round` | `300` |
| `early_stopping_rounds` | `30` |

## Mapping classes (figé, `tradable_v1`)

| Classe | Index |
|---|---|
| `SHORT` | `0` |
| `NEUTRAL` | `1` |
| `LONG` | `2` |

## Features P1 v1 (ordre vectoriel)

| # | Nom | Description |
|---|---|---|
| 1 | `ret_1m` | `ln(close_t / close_{t-1})` |
| 2 | `ret_5m` | `ln(close_t / close_{t-5})` |
| 3 | `ret_15m` | `ln(close_t / close_{t-15})` |
| 4 | `vwap_gap` | `(close_t - vwap_t) / vwap_t` |
| 5 | `rsi14` | RSI 14 périodes sur closes ≤ t |
| 6 | `ema_spread_9_20` | `(ema9_t - ema20_t) / close_t` |
| 7 | `ema_cross_event` | `+1` bullish, `-1` bearish, `0` neutre |
| 8 | `vol_spike_20` | `volume_t / mean(volume_{t-20..t-1})` |
| 9 | `poc_distance` | `(close_t - poc_t) / close_t` |
| 10 | `cvd_delta_5` | `(cvd_t - cvd_{t-5}) / sum(vol_{t-4..t})` |
| 11 | `footprint_imbalance_recent` | `(up - down) / 3` sur les 3 dernières barres |
