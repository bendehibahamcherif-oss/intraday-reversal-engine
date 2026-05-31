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
IDX_TO_CLASS = {v: k for k, v in CLASS_MAPPING.items()}

DEFAULT_PARAMS = {
    "objective": "multi:softprob",
    "num_class": 3,
    "eval_metric": ["mlogloss", "merror"],
    "tree_method": "hist",
    "eta": 0.05,
    "max_depth": 4,
    "min_child_weight": 5,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "reg_lambda": 1.0,
    "seed": 42,
}

DEFAULT_NUM_BOOST_ROUND = 300
DEFAULT_EARLY_STOPPING_ROUNDS = 30
DEFAULT_HORIZON_BARS = 5
MIN_SAMPLES = 30


def err_exit(message: str) -> None:
    print(json.dumps({"status": "error", "message": message}), flush=True)
    sys.exit(1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train XGBoost signal model.")
    parser.add_argument("--dataset", required=True, help="Path to dataset JSON file.")
    parser.add_argument("--output-dir", required=True, help="Directory for output artefacts.")
    parser.add_argument(
        "--config",
        default="{}",
        help="JSON string of optional hyperparameter overrides.",
    )
    return parser.parse_args()


def load_dataset(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    required = {"X", "y", "feature_names"}
    missing = required - set(data.keys())
    if missing:
        err_exit(f"Dataset missing keys: {sorted(missing)}")
    return data


def chronological_split(n: int, horizon_bars: int) -> tuple[range, range, range]:
    """Return (train_idx, val_idx, test_idx) with gap enforcement."""
    train_end = int(n * 0.70)
    val_end = int(n * 0.85)

    val_start = train_end + horizon_bars
    test_start = val_end + horizon_bars

    if val_start >= val_end or test_start >= n:
        err_exit(
            f"Dataset too small ({n} samples) to apply a {horizon_bars}-bar gap with 70/15/15 split."
        )

    return range(0, train_end), range(val_start, val_end), range(test_start, n)


def compute_metrics(y_true: np.ndarray, y_pred_proba: np.ndarray, label: str) -> dict:
    """Compute accuracy, f1_macro, mlogloss and per-class stats."""
    y_pred = np.argmax(y_pred_proba, axis=1)

    acc = float(accuracy_score(y_true, y_pred))
    f1_macro = float(f1_score(y_true, y_pred, average="macro", zero_division=0))
    logloss = float(log_loss(y_true, y_pred_proba, labels=[0, 1, 2]))

    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=[0, 1, 2], zero_division=0
    )

    per_class = {}
    for idx, class_name in IDX_TO_CLASS.items():
        per_class[class_name] = {
            "precision": float(precision[idx]),
            "recall": float(recall[idx]),
            "f1": float(f1[idx]),
            "support": int(support[idx]),
        }

    class_dist = {}
    for class_idx, class_name in IDX_TO_CLASS.items():
        class_dist[class_name] = int(np.sum(y_true == class_idx))

    return {
        "accuracy": acc,
        "f1_macro": f1_macro,
        "mlogloss": logloss,
        "perClass": per_class,
        "classDistribution": class_dist,
    }


def main() -> None:
    args = parse_args()

    # --- Parse config overrides ---
    try:
        user_config = json.loads(args.config)
    except json.JSONDecodeError as exc:
        err_exit(f"Invalid --config JSON: {exc}")

    horizon_bars = int(user_config.pop("horizonBars", DEFAULT_HORIZON_BARS))
    num_boost_round = int(user_config.pop("num_boost_round", DEFAULT_NUM_BOOST_ROUND))
    early_stopping_rounds = int(
        user_config.pop("early_stopping_rounds", DEFAULT_EARLY_STOPPING_ROUNDS)
    )

    params = {**DEFAULT_PARAMS, **user_config}
    # Ensure fixed seed regardless of override (override wins if provided)
    seed = int(params.get("seed", 42))
    np.random.seed(seed)

    # --- Load dataset ---
    try:
        dataset = load_dataset(args.dataset)
    except FileNotFoundError:
        err_exit(f"Dataset file not found: {args.dataset}")
    except json.JSONDecodeError as exc:
        err_exit(f"Failed to parse dataset JSON: {exc}")

    X_all = np.array(dataset["X"], dtype=np.float32)
    y_all = np.array(dataset["y"], dtype=np.int32)
    feature_names: list[str] = list(dataset["feature_names"])
    dataset_hash: str = dataset.get("datasetHash", "")

    n_samples = len(y_all)
    if n_samples < MIN_SAMPLES:
        err_exit(f"Dataset has only {n_samples} samples; minimum required is {MIN_SAMPLES}.")

    if X_all.shape[0] != n_samples:
        err_exit("Mismatch between X rows and y length.")

    # --- Chronological split ---
    train_idx, val_idx, test_idx = chronological_split(n_samples, horizon_bars)

    X_train, y_train = X_all[train_idx], y_all[train_idx]
    X_val, y_val = X_all[val_idx], y_all[val_idx]
    X_test, y_test = X_all[test_idx], y_all[test_idx]

    # --- Build DMatrix ---
    dtrain = xgb.DMatrix(X_train, label=y_train, feature_names=feature_names)
    dval = xgb.DMatrix(X_val, label=y_val, feature_names=feature_names)
    dtest = xgb.DMatrix(X_test, label=y_test, feature_names=feature_names)

    evals = [(dtrain, "train"), (dval, "val")]
    evals_result: dict = {}

    # --- Train ---
    booster = xgb.train(
        params,
        dtrain,
        num_boost_round=num_boost_round,
        evals=evals,
        evals_result=evals_result,
        early_stopping_rounds=early_stopping_rounds,
        verbose_eval=False,
    )

    best_iteration: int = int(booster.best_iteration)
    best_score: float = float(booster.best_score)

    # --- Predict probabilities ---
    def predict_proba(booster: xgb.Booster, dmat: xgb.DMatrix) -> np.ndarray:
        raw = booster.predict(dmat, iteration_range=(0, booster.best_iteration + 1))
        return raw.reshape(-1, 3)

    train_proba = predict_proba(booster, dtrain)
    val_proba = predict_proba(booster, dval)
    test_proba = predict_proba(booster, dtest)

    train_metrics = compute_metrics(y_train, train_proba, "train")
    val_metrics = compute_metrics(y_val, val_proba, "val")
    test_metrics = compute_metrics(y_test, test_proba, "test")

    # --- Feature importance (gain) ---
    importance_raw: dict[str, float] = booster.get_score(importance_type="gain")
    # Sort descending; take top 10
    sorted_importance = sorted(importance_raw.items(), key=lambda kv: kv[1], reverse=True)
    top10_importance = {k: float(v) for k, v in sorted_importance[:10]}
    full_importance = {k: float(v) for k, v in importance_raw.items()}

    # --- Prepare output directory ---
    os.makedirs(args.output_dir, exist_ok=True)
    model_path = os.path.join(args.output_dir, "model.ubj")
    metrics_path = os.path.join(args.output_dir, "metrics.json")
    manifest_path = os.path.join(args.output_dir, "manifest.json")

    # --- Save model ---
    booster.save_model(model_path)

    # --- Save metrics ---
    metrics_payload = {
        "trainMetrics": train_metrics,
        "valMetrics": val_metrics,
        "testMetrics": test_metrics,
        "featureImportance": full_importance,
        "bestIteration": best_iteration,
        "bestScore": best_score,
        "trainSize": len(y_train),
        "valSize": len(y_val),
        "testSize": len(y_test),
    }
    with open(metrics_path, "w", encoding="utf-8") as fh:
        json.dump(metrics_payload, fh, indent=2)

    # --- Save manifest ---
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    model_version = f"xgb_p1_v1_{timestamp}"

    manifest = {
        "modelVersion": model_version,
        "featureVersion": "p1_v1",
        "labelSpecVersion": "tradable_v1",
        "classMapping": CLASS_MAPPING,
        "datasetHash": dataset_hash,
        "featureNames": feature_names,
        "trainMetrics": {
            "accuracy": train_metrics["accuracy"],
            "f1_macro": train_metrics["f1_macro"],
            "mlogloss": train_metrics["mlogloss"],
        },
        "valMetrics": {
            "accuracy": val_metrics["accuracy"],
            "f1_macro": val_metrics["f1_macro"],
            "mlogloss": val_metrics["mlogloss"],
        },
        "testMetrics": {
            "accuracy": test_metrics["accuracy"],
            "f1_macro": test_metrics["f1_macro"],
            "mlogloss": test_metrics["mlogloss"],
        },
        "bestIteration": best_iteration,
        "bestScore": best_score,
        "featureImportance": top10_importance,
        "trainSize": len(y_train),
        "valSize": len(y_val),
        "testSize": len(y_test),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "seed": seed,
    }

    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)

    # --- Done ---
    print(
        json.dumps(
            {
                "status": "ok",
                "manifestPath": os.path.abspath(manifest_path),
                "modelPath": os.path.abspath(model_path),
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # pylint: disable=broad-except
        err_exit(str(exc))
