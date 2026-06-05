#!/usr/bin/env python3
"""Minimal real ML training pipeline for the Intraday Reversal Engine.

This script intentionally works without third-party Python packages so a first
model can be trained in constrained deployments. If pandas is installed it can
also read Parquet snapshots; otherwise CSV snapshots remain fully supported.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import random
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

REQUIRED_COLUMNS = ["timestamp", "symbol", "open", "high", "low", "close", "volume"]
OPTIONAL_FEATURES = [
    "ret_1", "ret_5", "range_1", "body_pct", "rsi14", "ema9_spread", "ema20_spread",
    "vwap_spread", "dist_poc", "dist_vah", "dist_val", "cvd_slope", "l1_queue_imbalance",
    "footprint_imbalance_count",
]
P1_FEATURES = [
    "ret_1", "ret_5", "ret_20", "range_pct", "body_pct", "upper_wick_pct", "lower_wick_pct",
    "volume_zscore_20", "realized_vol_20", "ema9_spread", "ema20_spread", "vwap_spread",
]
CLASSES = [0, 1, 2]
CLASS_NAMES = {0: "SHORT", 1: "NEUTRAL", 2: "LONG"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def fail(status: str, message: str, **details) -> int:
    print(json.dumps({"ok": False, "status": status, "message": message, "details": details}), flush=True)
    return 0


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def safe_float(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        f = float(value)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def load_rows(path: Path) -> list[dict]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        with path.open("r", newline="") as handle:
            return [dict(row) for row in csv.DictReader(handle)]
    if suffix in {".parquet", ".pq"}:
        try:
            import pandas as pd  # type: ignore
        except Exception as exc:
            raise RuntimeError("Parquet dataset requires pandas/pyarrow; provide CSV or install parquet dependencies") from exc
        return pd.read_parquet(path).to_dict(orient="records")
    raise ValueError(f"Unsupported dataset extension: {suffix}")


def validate_and_clean(rows: list[dict], symbol: str | None) -> list[dict]:
    if not rows:
        raise ValueError("Dataset is empty")
    missing = [col for col in REQUIRED_COLUMNS if col not in rows[0]]
    if missing:
        raise ValueError(f"Dataset missing required columns: {', '.join(missing)}")
    out = []
    for row in rows:
        if symbol and str(row.get("symbol", "")).upper() != symbol.upper():
            continue
        clean = {"timestamp": str(row.get("timestamp")), "symbol": str(row.get("symbol", "")).upper()}
        ok = True
        for col in ["open", "high", "low", "close", "volume"]:
            val = safe_float(row.get(col))
            if val is None:
                ok = False
                break
            clean[col] = val
        if not ok:
            continue
        for col in OPTIONAL_FEATURES + P1_FEATURES:
            val = safe_float(row.get(col))
            if val is not None:
                clean[col] = val
        out.append(clean)
    out.sort(key=lambda r: r["timestamp"])
    return out


def ema(values: list[float], period: int) -> list[float]:
    alpha = 2.0 / (period + 1.0)
    result = []
    current = values[0]
    for value in values:
        current = alpha * value + (1 - alpha) * current
        result.append(current)
    return result


def rolling_mean(values: list[float], window: int, end: int) -> float | None:
    if end + 1 < window:
        return None
    return statistics.fmean(values[end - window + 1:end + 1])


def rolling_stdev(values: list[float], window: int, end: int) -> float | None:
    if end + 1 < window:
        return None
    segment = values[end - window + 1:end + 1]
    if len(segment) < 2:
        return 0.0
    return statistics.pstdev(segment)


def compute_features(rows: list[dict]) -> tuple[list[dict], list[str]]:
    closes = [r["close"] for r in rows]
    highs = [r["high"] for r in rows]
    lows = [r["low"] for r in rows]
    opens = [r["open"] for r in rows]
    volumes = [r["volume"] for r in rows]
    ema9 = ema(closes, 9) if rows else []
    ema20 = ema(closes, 20) if rows else []
    cum_pv = 0.0
    cum_vol = 0.0
    vwap_values = []
    for i, row in enumerate(rows):
        typical = (highs[i] + lows[i] + closes[i]) / 3.0
        cum_pv += typical * volumes[i]
        cum_vol += volumes[i]
        vwap_values.append(cum_pv / cum_vol if cum_vol else closes[i])

    featured = []
    candidate_names = list(dict.fromkeys(OPTIONAL_FEATURES + P1_FEATURES))
    for i, row in enumerate(rows):
        out = dict(row)
        close = closes[i]
        prev = closes[i - 1] if i >= 1 else None
        out.setdefault("ret_1", (close / prev - 1.0) if prev else 0.0)
        out.setdefault("ret_5", (close / closes[i - 5] - 1.0) if i >= 5 and closes[i - 5] else 0.0)
        out.setdefault("ret_20", (close / closes[i - 20] - 1.0) if i >= 20 and closes[i - 20] else 0.0)
        out.setdefault("range_pct", ((highs[i] - lows[i]) / close) if close else 0.0)
        out.setdefault("range_1", out["range_pct"])
        candle_range = max(highs[i] - lows[i], 1e-12)
        out.setdefault("body_pct", abs(closes[i] - opens[i]) / candle_range)
        out.setdefault("upper_wick_pct", (highs[i] - max(opens[i], closes[i])) / candle_range)
        out.setdefault("lower_wick_pct", (min(opens[i], closes[i]) - lows[i]) / candle_range)
        vol_mean = rolling_mean(volumes, 20, i)
        vol_std = rolling_stdev(volumes, 20, i)
        out.setdefault("volume_zscore_20", ((volumes[i] - vol_mean) / vol_std) if vol_mean is not None and vol_std and vol_std > 0 else 0.0)
        ret_window = [((closes[j] / closes[j - 1]) - 1.0) for j in range(max(1, i - 19), i + 1)]
        out.setdefault("realized_vol_20", statistics.pstdev(ret_window) if len(ret_window) > 1 else 0.0)
        out.setdefault("ema9_spread", (close / ema9[i] - 1.0) if ema9[i] else 0.0)
        out.setdefault("ema20_spread", (close / ema20[i] - 1.0) if ema20[i] else 0.0)
        out.setdefault("vwap_spread", (close / vwap_values[i] - 1.0) if vwap_values[i] else 0.0)
        featured.append(out)
    feature_names = [name for name in candidate_names if any(name in row for row in featured)]
    return featured, feature_names


def make_labels(rows: list[dict], horizon: int, cost_bps: float, tau_up: float, tau_dn: float) -> list[int | None]:
    labels: list[int | None] = []
    for i in range(len(rows)):
        entry_i = i + 1
        exit_i = i + horizon
        if entry_i >= len(rows) or exit_i >= len(rows):
            labels.append(None)
            continue
        entry = rows[entry_i]["open"]
        exit_price = rows[exit_i]["close"]
        net_return = (exit_price - entry) / entry - cost_bps / 10000.0
        if net_return < -tau_dn:
            labels.append(0)
        elif net_return > tau_up:
            labels.append(2)
        else:
            labels.append(1)
    return labels


def build_matrix(rows: list[dict], labels: list[int | None], feature_names: list[str]) -> tuple[list[list[float]], list[int]]:
    X, y = [], []
    for row, label in zip(rows, labels):
        if label is None:
            continue
        vector = []
        ok = True
        for name in feature_names:
            val = safe_float(row.get(name))
            if val is None:
                ok = False
                break
            vector.append(val)
        if ok:
            X.append(vector)
            y.append(int(label))
    return X, y


def chronological_split(n: int, horizon: int) -> dict:
    train_end = int(n * 0.70)
    val_start = train_end + horizon
    val_end = int(n * 0.85)
    test_start = val_end + horizon
    if train_end <= 0 or val_start >= n or test_start >= n:
        raise ValueError("not enough rows for chronological split with required horizon gap")
    return {"train": [0, train_end], "val": [val_start, val_end], "test": [test_start, n], "gap": horizon, "shuffle": False}


def select_split(X: list[list[float]], y: list[int], start: int, end: int) -> tuple[list[list[float]], list[int]]:
    return X[start:end], y[start:end]


def standardize_fit(X: list[list[float]]) -> tuple[list[float], list[float]]:
    cols = len(X[0])
    means, stds = [], []
    for j in range(cols):
        values = [row[j] for row in X]
        mean = statistics.fmean(values)
        std = statistics.pstdev(values) or 1.0
        means.append(mean)
        stds.append(std)
    return means, stds


def standardize_transform(X: list[list[float]], means: list[float], stds: list[float]) -> list[list[float]]:
    return [[(row[j] - means[j]) / stds[j] for j in range(len(row))] for row in X]


def softmax(scores: list[float]) -> list[float]:
    max_score = max(scores)
    exps = [math.exp(s - max_score) for s in scores]
    total = sum(exps)
    return [e / total for e in exps]


def train_softmax(X: list[list[float]], y: list[int], epochs: int = 350, lr: float = 0.08, l2: float = 0.001) -> dict:
    random.seed(42)
    n_features = len(X[0])
    weights = [[random.uniform(-0.01, 0.01) for _ in range(n_features)] for _ in CLASSES]
    bias = [0.0 for _ in CLASSES]
    n = len(X)
    for _ in range(epochs):
        grad_w = [[0.0 for _ in range(n_features)] for _ in CLASSES]
        grad_b = [0.0 for _ in CLASSES]
        for row, label in zip(X, y):
            probs = softmax([sum(weights[k][j] * row[j] for j in range(n_features)) + bias[k] for k in CLASSES])
            for k in CLASSES:
                diff = probs[k] - (1.0 if label == k else 0.0)
                grad_b[k] += diff
                for j in range(n_features):
                    grad_w[k][j] += diff * row[j]
        for k in CLASSES:
            bias[k] -= lr * grad_b[k] / n
            for j in range(n_features):
                grad = grad_w[k][j] / n + l2 * weights[k][j]
                weights[k][j] -= lr * grad
    return {"weights": weights, "bias": bias, "classes": CLASSES, "classNames": CLASS_NAMES}


def predict_proba(model: dict, X: list[list[float]]) -> list[list[float]]:
    weights, bias = model["weights"], model["bias"]
    return [softmax([sum(weights[k][j] * row[j] for j in range(len(row))) + bias[k] for k in CLASSES]) for row in X]


def argmax(values: list[float]) -> int:
    return max(range(len(values)), key=lambda i: values[i])


def metrics(y_true: list[int], probs: list[list[float]]) -> dict:
    preds = [argmax(p) for p in probs]
    n = len(y_true)
    accuracy = sum(1 for a, b in zip(y_true, preds) if a == b) / n if n else 0.0
    f1s = []
    for cls in CLASSES:
        tp = sum(1 for yt, yp in zip(y_true, preds) if yt == cls and yp == cls)
        fp = sum(1 for yt, yp in zip(y_true, preds) if yt != cls and yp == cls)
        fn = sum(1 for yt, yp in zip(y_true, preds) if yt == cls and yp != cls)
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1s.append(2 * precision * recall / (precision + recall) if precision + recall else 0.0)
    loss = -sum(math.log(max(probs[i][y_true[i]], 1e-15)) for i in range(n)) / n if n else None
    long_brier = sum(((1.0 if y_true[i] == 2 else 0.0) - probs[i][2]) ** 2 for i in range(n)) / n if n else None
    cm = [[0 for _ in CLASSES] for _ in CLASSES]
    for yt, yp in zip(y_true, preds):
        cm[yt][yp] += 1
    dist = {str(cls): sum(1 for label in y_true if label == cls) for cls in CLASSES}
    return {"accuracy": accuracy, "f1_macro": statistics.fmean(f1s), "log_loss": loss, "roc_auc_ovr": None, "brier_long": long_brier, "confusion_matrix": cm, "class_distribution": dist}


def train(args: argparse.Namespace) -> dict:
    dataset = Path(args.dataset).resolve()
    if not dataset.exists():
        return {"ok": False, "status": "dataset_missing", "message": f"Dataset not found: {dataset}"}
    raw_rows = load_rows(dataset)
    rows = validate_and_clean(raw_rows, args.symbol)
    if len(rows) < args.min_samples:
        return {"ok": False, "status": "not_enough_data", "message": f"Need at least {args.min_samples} clean rows after filtering; found {len(rows)}", "details": {"rows": len(rows), "minSamples": args.min_samples}}
    rows, feature_names = compute_features(rows)
    labels = make_labels(rows, args.horizon, args.cost_bps, args.tau_up, args.tau_dn)
    X, y = build_matrix(rows, labels, feature_names)
    if len(X) < args.min_samples:
        return {"ok": False, "status": "not_enough_data", "message": f"Need at least {args.min_samples} labeled rows; found {len(X)}", "details": {"labeledRows": len(X), "droppedTailRows": sum(1 for label in labels if label is None)}}
    if len(set(y)) < 2:
        return {"ok": False, "status": "not_enough_data", "message": "Need at least two target classes to train a classifier", "details": {"classDistribution": {str(c): y.count(c) for c in CLASSES}}}
    split = chronological_split(len(X), args.horizon)
    X_train, y_train = select_split(X, y, *split["train"])
    X_val, y_val = select_split(X, y, *split["val"])
    X_test, y_test = select_split(X, y, *split["test"])
    if not X_train or not X_val or not X_test:
        return {"ok": False, "status": "not_enough_data", "message": "Train/validation/test split is empty after horizon gap", "details": split}
    means, stds = standardize_fit(X_train)
    X_train_s = standardize_transform(X_train, means, stds)
    X_val_s = standardize_transform(X_val, means, stds)
    X_test_s = standardize_transform(X_test, means, stds)
    model = train_softmax(X_train_s, y_train)
    val_metrics = metrics(y_val, predict_proba(model, X_val_s))
    test_metrics = metrics(y_test, predict_proba(model, X_test_s))
    dataset_hash = sha256_file(dataset)
    schema_hash = hashlib.sha256(json.dumps(feature_names, sort_keys=True).encode()).hexdigest()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    model_id = f"{args.symbol}_{args.timeframe}_h{args.horizon}_{stamp}_{dataset_hash[:8]}".replace("/", "_")
    artifact_dir = Path(args.output_dir).resolve() / model_id
    artifact_dir.mkdir(parents=True, exist_ok=True)
    model_doc = {"artifact_type": "pure_python_softmax_json", "model": model, "standardizer": {"mean": means, "scale": stds}, "feature_names": feature_names}
    (artifact_dir / "model.json").write_text(json.dumps(model_doc, indent=2))
    feature_schema = {"features": [{"name": name, "dtype": "float", "source": "provided_or_p1_ohlcv"} for name in feature_names], "featureSchemaHash": schema_hash}
    (artifact_dir / "feature_schema.json").write_text(json.dumps(feature_schema, indent=2))
    all_metrics = {"validation": val_metrics, "test": test_metrics, "split": split, "classNames": CLASS_NAMES}
    (artifact_dir / "metrics.json").write_text(json.dumps(all_metrics, indent=2))
    manifest = {
        "modelId": model_id, "modelVersion": model_id, "createdAt": utc_now(), "symbol": args.symbol,
        "timeframe": args.timeframe, "horizon": args.horizon, "datasetPath": str(dataset), "datasetHash": dataset_hash,
        "featureSchemaHash": schema_hash, "artifactPath": str(artifact_dir), "artifactFile": str(artifact_dir / "model.json"),
        "artifact_type": "pure_python_softmax_json", "status": "candidate", "metrics": test_metrics,
        "featureCount": len(feature_names), "trainingRows": len(y_train), "validationRows": len(y_val), "testRows": len(y_test),
    }
    (artifact_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    report = {"ok": True, "status": "trained", "manifest": manifest, "metrics": all_metrics, "labelsDroppedTailRows": sum(1 for label in labels if label is None), "split": split}
    (artifact_dir / "train_report.json").write_text(json.dumps(report, indent=2))
    (artifact_dir / "model_card.md").write_text(f"# {model_id}\n\nMinimal real classifier trained on chronological OHLCV data.\n\n- Symbol: {args.symbol}\n- Timeframe: {args.timeframe}\n- Horizon: {args.horizon}\n- Artifact type: pure_python_softmax_json\n")
    return {"ok": True, "status": "trained", "modelId": model_id, "artifactPath": str(artifact_dir), "manifestPath": str(artifact_dir / "manifest.json"), "metrics": test_metrics, "manifest": manifest}


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", "--snapshot", dest="dataset", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--symbol", default="SPY")
    parser.add_argument("--timeframe", default="1m")
    parser.add_argument("--horizon", type=int, default=20)
    parser.add_argument("--cost-bps", type=float, default=0.0)
    parser.add_argument("--tau-up", type=float, default=0.0005)
    parser.add_argument("--tau-dn", type=float, default=0.0005)
    parser.add_argument("--min-samples", type=int, default=80)
    return parser.parse_args(list(argv))


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    try:
        result = train(args)
        print(json.dumps(result), flush=True)
        return 0
    except Exception as exc:
        return fail("training_failed", str(exc))


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
