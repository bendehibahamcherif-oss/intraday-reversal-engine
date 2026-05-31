"""
dataset_builder.py — Assembles features + labels into a training-ready dataset.

Index: (symbol, timeframe, close_ts) — MultiIndex stored in Parquet snapshots.
Sources are joined as-of t (no future data leaks through).
Saves a snapshot as Parquet and computes a SHA256 dataset_hash so that any
downstream artefact can be traced back to the exact data it was built from.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from server_deliverables.ai.config import (
    HORIZON,
    MIN_SAMPLES,
    SNAPSHOT_DIR,
    TAU,
)
from server_deliverables.ai.training.feature_builder import (
    build_features,
    get_feature_names,
    get_feature_schema,
)
from server_deliverables.ai.training.label_builder import label_multiclass, label_stats

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def build_dataset(
    ohlcv_df: pd.DataFrame,
    *,
    symbol: str,
    timeframe: str,
    horizon: int = HORIZON,
    tau: float = TAU,
    output_dir: str | None = None,
) -> dict:
    """Build a labeled, training-ready dataset from a raw OHLCV DataFrame.

    The function performs the following steps in strict chronological order
    (no lookahead at any point):

    1. Compute P1 features via :func:`build_features` — all as-of t.
    2. Compute 3-class labels via :func:`label_multiclass` on the raw OHLCV.
    3. Align features and labels on their shared index (inner join).
    4. Validate that ``MIN_SAMPLES`` is met.
    5. Optionally save a Parquet snapshot and return its path.
    6. Compute SHA256 hashes for data integrity tracking.

    Parameters
    ----------
    ohlcv_df:
        Raw OHLCV + orderflow DataFrame with a ``DatetimeIndex``.
        Must contain the columns required by :func:`build_features` plus
        ``open`` and ``close`` for label construction.
    symbol:
        Ticker symbol (e.g. ``"AAPL"``).  Stored in snapshot MultiIndex.
    timeframe:
        Bar timeframe string (e.g. ``"1m"``).  Stored in snapshot MultiIndex.
    horizon:
        Number of forward bars for exit price.  Defaults to :data:`config.HORIZON`.
    tau:
        Label threshold (net return magnitude).  Defaults to :data:`config.TAU`.
    output_dir:
        Directory to write the Parquet snapshot.  If ``None``, the value from
        :data:`config.SNAPSHOT_DIR` is used.  Pass ``""`` to skip saving.

    Returns
    -------
    dict
        Keys:

        ``X``
            Feature matrix as ``np.ndarray`` of shape ``(n_samples, n_features)``.
        ``y``
            Label vector as ``np.ndarray`` of shape ``(n_samples,)``, dtype int64.
        ``feature_names``
            Ordered list of feature column names.
        ``dataset_hash``
            SHA256 hex digest of the X matrix bytes (reproducibility token).
        ``feature_schema_hash``
            SHA256 hex digest of ``json.dumps(get_feature_schema(), sort_keys=True)``.
        ``n_samples``
            Number of samples after alignment and NaN dropping.
        ``class_distribution``
            Output of :func:`label_builder.label_stats`.
        ``snapshot_path``
            Absolute path of the saved Parquet file, or ``None`` if not saved.
        ``built_at``
            ISO-8601 UTC timestamp of when the dataset was built.
    """
    # ------------------------------------------------------------------
    # Step 1 — Build features (as-of t, NaN rows already dropped)
    # ------------------------------------------------------------------
    features_df = build_features(ohlcv_df)

    # ------------------------------------------------------------------
    # Step 2 — Build labels (last `horizon` rows dropped)
    # ------------------------------------------------------------------
    labels_series = label_multiclass(ohlcv_df, horizon=horizon, tau=tau)

    # ------------------------------------------------------------------
    # Step 3 — Align on shared index (inner join to avoid any NaN)
    # ------------------------------------------------------------------
    shared_idx = features_df.index.intersection(labels_series.index)
    features_df = features_df.loc[shared_idx]
    labels_series = labels_series.loc[shared_idx]

    n_samples = len(features_df)
    logger.info(
        "build_dataset: symbol=%s timeframe=%s → %d samples after alignment.",
        symbol,
        timeframe,
        n_samples,
    )

    # ------------------------------------------------------------------
    # Step 4 — Validate sample count
    # ------------------------------------------------------------------
    if n_samples < MIN_SAMPLES:
        raise ValueError(
            f"Insufficient samples: {n_samples} < MIN_SAMPLES={MIN_SAMPLES}. "
            f"Provide more data or reduce the horizon/warmup period."
        )

    # ------------------------------------------------------------------
    # Step 5 — Convert to numpy
    # ------------------------------------------------------------------
    feature_names = get_feature_names()
    X = features_df[feature_names].values.astype(np.float64)
    y = labels_series.values.astype(np.int64)

    # ------------------------------------------------------------------
    # Step 6 — Compute hashes
    # ------------------------------------------------------------------
    dataset_hash = _hash_array(X)
    feature_schema_hash = _hash_json(get_feature_schema())
    class_dist = label_stats(labels_series)

    # ------------------------------------------------------------------
    # Step 7 — Save snapshot (optional)
    # ------------------------------------------------------------------
    snapshot_path: str | None = None
    save_dir = output_dir if output_dir is not None else SNAPSHOT_DIR

    if save_dir:
        snapshot_path = _save_snapshot(
            features_df=features_df,
            labels_series=labels_series,
            symbol=symbol,
            timeframe=timeframe,
            dataset_hash=dataset_hash,
            output_dir=save_dir,
        )

    built_at = datetime.now(tz=timezone.utc).isoformat()

    return {
        "X": X,
        "y": y,
        "feature_names": feature_names,
        "dataset_hash": dataset_hash,
        "feature_schema_hash": feature_schema_hash,
        "n_samples": n_samples,
        "class_distribution": class_dist,
        "snapshot_path": snapshot_path,
        "built_at": built_at,
    }


def load_snapshot(path: str) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Load X, y, and feature_names from a Parquet snapshot.

    The snapshot is expected to have been produced by :func:`build_dataset`.
    The ``label`` column holds integer class labels; all remaining non-index
    columns are feature columns in the order they were saved.

    Parameters
    ----------
    path:
        Absolute or relative path to the Parquet file.

    Returns
    -------
    tuple[np.ndarray, np.ndarray, list[str]]
        ``(X, y, feature_names)`` where ``X`` is float64 of shape
        ``(n_samples, n_features)`` and ``y`` is int64 of shape ``(n_samples,)``.
    """
    df = pd.read_parquet(path)

    if "label" not in df.columns:
        raise ValueError(
            f"Snapshot at '{path}' does not contain a 'label' column. "
            "Ensure it was created by build_dataset()."
        )

    feature_names = [c for c in df.columns if c != "label"]
    X = df[feature_names].values.astype(np.float64)
    y = df["label"].values.astype(np.int64)

    logger.info(
        "load_snapshot: loaded %d samples, %d features from '%s'.",
        len(y),
        len(feature_names),
        path,
    )

    return X, y, feature_names


def compute_hash(df: pd.DataFrame) -> str:
    """Compute the SHA256 hex digest of a DataFrame's values as raw bytes.

    The DataFrame is converted to a contiguous float64 numpy array before
    hashing so that the hash is independent of dtype storage details.

    Parameters
    ----------
    df:
        Any DataFrame whose numeric values should be hashed.

    Returns
    -------
    str
        64-character lowercase hex string (SHA256).
    """
    arr = df.values.astype(np.float64)
    return hashlib.sha256(arr.tobytes()).hexdigest()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _hash_array(arr: np.ndarray) -> str:
    """SHA256 hex digest of a numpy array flattened to bytes."""
    return hashlib.sha256(arr.astype(np.float64).tobytes()).hexdigest()


def _hash_json(obj: dict) -> str:
    """SHA256 hex digest of a JSON-serialised dict (sorted keys)."""
    serialised = json.dumps(obj, sort_keys=True)
    return hashlib.sha256(serialised.encode("utf-8")).hexdigest()


def _save_snapshot(
    features_df: pd.DataFrame,
    labels_series: pd.Series,
    symbol: str,
    timeframe: str,
    dataset_hash: str,
    output_dir: str,
) -> str:
    """Persist the aligned features + labels as a Parquet file.

    The saved DataFrame has a three-level MultiIndex:
    ``(symbol, timeframe, close_ts)`` where ``close_ts`` is the original
    DatetimeIndex of the input data.

    Parameters
    ----------
    features_df:
        Aligned feature DataFrame.
    labels_series:
        Aligned label Series (name='label').
    symbol:
        Ticker symbol.
    timeframe:
        Bar timeframe string.
    dataset_hash:
        SHA256 hash of the feature matrix (used in the filename for traceability).
    output_dir:
        Directory to write the file.

    Returns
    -------
    str
        Absolute path of the written Parquet file.
    """
    os.makedirs(output_dir, exist_ok=True)

    # Combine features and label into a single DataFrame
    snapshot = features_df.copy()
    snapshot["label"] = labels_series

    # Build MultiIndex: (symbol, timeframe, close_ts)
    multi_idx = pd.MultiIndex.from_arrays(
        [
            [symbol] * len(snapshot),
            [timeframe] * len(snapshot),
            snapshot.index,
        ],
        names=["symbol", "timeframe", "close_ts"],
    )
    snapshot.index = multi_idx

    # File name encodes symbol, timeframe, and a short hash prefix for uniqueness
    filename = f"snapshot_{symbol}_{timeframe}_{dataset_hash[:12]}.parquet"
    filepath = os.path.join(output_dir, filename)

    snapshot.to_parquet(filepath, engine="pyarrow", compression="snappy", index=True)

    logger.info("build_dataset: snapshot saved → '%s'.", filepath)
    return os.path.abspath(filepath)
