"""
prediction_service.py — Batch inference service.

Can be called as:
  python prediction_service.py --model path/to/model.ubj \
      --features '[[f1,f2,...],[f1,f2,...]]' \
      --feature-names '["ret_1","ret_2",...]'

Or imported:
  from prediction_service import batch_predict
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from typing import Dict, List

import numpy as np
import xgboost as xgb

# ---------------------------------------------------------------------------
# Config fallbacks
# ---------------------------------------------------------------------------
try:
    from config import CLASS_MAPPING, IDX_TO_CLASS  # noqa: F401
    _CLASS_NAMES: List[str] = [IDX_TO_CLASS[i] for i in sorted(IDX_TO_CLASS)]
except ImportError:
    CLASS_MAPPING = {"SHORT": 0, "NEUTRAL": 1, "LONG": 2}
    IDX_TO_CLASS = {0: "SHORT", 1: "NEUTRAL", 2: "LONG"}
    _CLASS_NAMES = ["SHORT", "NEUTRAL", "LONG"]

# ---------------------------------------------------------------------------
# Module-level model cache
# ---------------------------------------------------------------------------
# Maps model_path -> xgb.Booster so repeated calls reuse the same object.
_MODEL_CACHE: Dict[str, xgb.Booster] = {}


def load_cached_model(model_path: str) -> xgb.Booster:
    """
    Load an XGBoost booster from *model_path*, caching it at module level.

    Subsequent calls with the same *model_path* return the cached object
    without I/O.  The cache is never invalidated automatically; restart the
    process (or call ``_MODEL_CACHE.clear()``) to force a fresh load.
    """
    if model_path not in _MODEL_CACHE:
        booster = xgb.Booster()
        booster.load_model(model_path)
        _MODEL_CACHE[model_path] = booster
    return _MODEL_CACHE[model_path]


# ---------------------------------------------------------------------------
# Core batch prediction
# ---------------------------------------------------------------------------

def _probs_to_signal_dict(
    probs: List[float],
    model_version: str,
) -> dict:
    """Convert a raw softprob output row into a structured signal dict."""
    n = len(_CLASS_NAMES)
    # Normalise length in case model has different num_class.
    if len(probs) < n:
        probs = list(probs) + [0.0] * (n - len(probs))
    elif len(probs) > n:
        probs = list(probs)[:n]

    class_idx = int(np.argmax(probs))
    max_prob = float(probs[class_idx])
    signal = IDX_TO_CLASS.get(class_idx, _CLASS_NAMES[class_idx])
    prob_dict = {_CLASS_NAMES[i]: float(probs[i]) for i in range(n)}

    return {
        "signal": signal,
        "probability": max_prob,
        "confidence": max_prob,
        "probabilities": prob_dict,
        "classIndex": class_idx,
        "modelVersion": model_version,
    }


def batch_predict(
    model_path: str,
    feature_matrix: List[List[float]],
    feature_names: List[str],
    model_version: str = "unknown",
) -> List[dict]:
    """
    Load (or retrieve cached) model at *model_path* and predict on the full
    *feature_matrix* in a single XGBoost call.

    Parameters
    ----------
    model_path:
        Filesystem path to the serialised XGBoost booster (.ubj / .json / .model).
    feature_matrix:
        List of feature vectors; each inner list must have ``len(feature_names)``
        elements.
    feature_names:
        Column names for the feature matrix (must match training schema).
    model_version:
        Arbitrary version string embedded in every output dict.

    Returns
    -------
    List of dicts, one per row, each containing:
        signal, probability, confidence, probabilities, classIndex, modelVersion
    """
    if not feature_matrix:
        return []

    booster = load_cached_model(model_path)

    arr = np.array(feature_matrix, dtype=np.float32)
    dmat = xgb.DMatrix(arr, feature_names=feature_names if feature_names else None)

    # raw shape is (n_rows, n_classes) for multi:softprob
    raw = booster.predict(dmat)

    # Reshape if XGBoost returns a flat array (older versions).
    n_rows = arr.shape[0]
    n_classes = len(_CLASS_NAMES)
    if raw.ndim == 1 and raw.shape[0] == n_rows * n_classes:
        raw = raw.reshape(n_rows, n_classes)
    elif raw.ndim == 1:
        # Single-row case — wrap it.
        raw = raw.reshape(1, -1)

    results: List[dict] = []
    for i in range(raw.shape[0]):
        results.append(_probs_to_signal_dict(raw[i].tolist(), model_version))

    return results


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Batch XGBoost inference service (CLI).",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    p.add_argument(
        "--model",
        required=True,
        metavar="PATH",
        help="Path to the XGBoost model file (.ubj / .json / .model).",
    )
    p.add_argument(
        "--features",
        required=True,
        metavar="JSON",
        help="JSON array of arrays — feature matrix [[f1,f2,...], ...].",
    )
    p.add_argument(
        "--feature-names",
        default="[]",
        metavar="JSON",
        dest="feature_names",
        help="JSON array of feature name strings (optional).",
    )
    p.add_argument(
        "--model-version",
        default="unknown",
        metavar="VERSION",
        dest="model_version",
        help="Version string to embed in output (optional).",
    )
    return p


def main(argv: List[str] | None = None) -> None:
    parser = _build_parser()
    args = parser.parse_args(argv)

    try:
        feature_matrix: List[List[float]] = json.loads(args.features)
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"Invalid --features JSON: {exc}"}))
        sys.exit(1)

    try:
        feature_names: List[str] = json.loads(args.feature_names)
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"Invalid --feature-names JSON: {exc}"}))
        sys.exit(1)

    t0 = time.perf_counter()
    try:
        results = batch_predict(
            model_path=args.model,
            feature_matrix=feature_matrix,
            feature_names=feature_names,
            model_version=args.model_version,
        )
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)

    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 3)
    output = {
        "results": results,
        "n_predictions": len(results),
        "batchInferenceMs": elapsed_ms,
    }
    print(json.dumps(output))


if __name__ == "__main__":
    main()
