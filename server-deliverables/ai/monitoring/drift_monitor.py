"""
drift_monitor.py — Population Stability Index (PSI) feature drift monitoring.

PSI measures how much a distribution has shifted between a reference (baseline)
period and a current period.

PSI formula
-----------
    PSI = sum_i( (actual_i - expected_i) * ln(actual_i / expected_i) )

where *expected_i* is the fraction of baseline samples in bucket i and
*actual_i* is the fraction of current samples in the same bucket.

Thresholds
----------
    PSI < 0.10            : Stable  (green)
    0.10 <= PSI < 0.20    : Warning (amber)
    PSI >= 0.20           : Critical (red)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List

import numpy as np

# ---------------------------------------------------------------------------
# Config fallbacks
# ---------------------------------------------------------------------------
try:
    from config import PSI_WARNING_THRESHOLD, PSI_CRITICAL_THRESHOLD  # noqa: F401
except ImportError:
    PSI_WARNING_THRESHOLD: float = 0.10
    PSI_CRITICAL_THRESHOLD: float = 0.20

# Class names for prediction-drift helper
try:
    from config import IDX_TO_CLASS  # noqa: F401
    _CLASS_NAMES: list[str] = [IDX_TO_CLASS[i] for i in sorted(IDX_TO_CLASS)]
except ImportError:
    _CLASS_NAMES = ["SHORT", "NEUTRAL", "LONG"]


# ---------------------------------------------------------------------------
# PSI helpers
# ---------------------------------------------------------------------------

def _psi_status(psi: float) -> str:
    """Map a PSI score to a human-readable status string."""
    if psi >= PSI_CRITICAL_THRESHOLD:
        return "critical"
    if psi >= PSI_WARNING_THRESHOLD:
        return "warning"
    return "stable"


def compute_psi(
    baseline: np.ndarray,
    current: np.ndarray,
    n_buckets: int = 10,
    epsilon: float = 1e-6,
) -> float:
    """
    Compute the Population Stability Index (PSI) between *baseline* and
    *current* distributions.

    Equal-frequency bucketing is derived from the baseline percentiles so
    that each baseline bucket contains roughly the same number of samples.
    This avoids artificially low PSI when baseline values are clustered.

    Parameters
    ----------
    baseline:
        1-D array of reference (historical) values.
    current:
        1-D array of incoming (production) values.
    n_buckets:
        Number of bins to use.  Defaults to 10.
    epsilon:
        Small constant added to all bucket fractions to avoid log(0).

    Returns
    -------
    float
        Non-negative PSI value.  Higher → more drift.

    Notes
    -----
    * If *baseline* or *current* is empty or contains only NaNs, returns 0.0.
    * Infinite / NaN values are silently dropped before bucketing.
    """
    baseline = np.asarray(baseline, dtype=np.float64).ravel()
    current = np.asarray(current, dtype=np.float64).ravel()

    # Drop non-finite values
    baseline = baseline[np.isfinite(baseline)]
    current = current[np.isfinite(current)]

    if len(baseline) == 0 or len(current) == 0:
        return 0.0

    # Build equal-frequency bin edges from baseline
    percentiles = np.linspace(0, 100, n_buckets + 1)
    bin_edges = np.percentile(baseline, percentiles)

    # Make edges unique (handles constant / near-constant distributions)
    bin_edges = np.unique(bin_edges)
    if len(bin_edges) < 2:
        # Distribution is effectively constant — no drift measurable
        return 0.0

    # Count samples per bucket (include right edge with np.digitize trick)
    # np.histogram handles the closed right edge on the last bin.
    baseline_counts, _ = np.histogram(baseline, bins=bin_edges)
    current_counts, _ = np.histogram(current, bins=bin_edges)

    # Convert to fractions and add epsilon to prevent log(0)
    baseline_frac = baseline_counts / len(baseline) + epsilon
    current_frac = current_counts / len(current) + epsilon

    # Re-normalise after epsilon addition so fractions sum to 1
    baseline_frac /= baseline_frac.sum()
    current_frac /= current_frac.sum()

    psi = float(np.sum((current_frac - baseline_frac) * np.log(current_frac / baseline_frac)))
    return max(0.0, psi)  # PSI is theoretically non-negative


# ---------------------------------------------------------------------------
# Full feature drift report
# ---------------------------------------------------------------------------

def compute_drift_report(
    baseline_X: np.ndarray,
    current_X: np.ndarray,
    feature_names: List[str],
) -> dict:
    """
    Compute per-feature PSI drift between *baseline_X* and *current_X*.

    Parameters
    ----------
    baseline_X:
        2-D array of shape ``(n_baseline, n_features)``.
    current_X:
        2-D array of shape ``(n_current, n_features)``.
    feature_names:
        List of length ``n_features`` with human-readable column names.

    Returns
    -------
    dict
        Structure::

            {
                "features": {
                    "<name>": {"psi": float, "status": "stable"|"warning"|"critical"}
                },
                "global_status": "stable"|"warning"|"critical",
                "n_features_warning": int,
                "n_features_critical": int,
                "computed_at": "<ISO-8601 UTC>",
            }

    Notes
    -----
    ``global_status`` reflects the worst status across all features:
    ``"critical"`` if any feature is critical, else ``"warning"`` if any is
    warning, else ``"stable"``.
    """
    baseline_X = np.asarray(baseline_X, dtype=np.float64)
    current_X = np.asarray(current_X, dtype=np.float64)

    if baseline_X.ndim == 1:
        baseline_X = baseline_X.reshape(-1, 1)
    if current_X.ndim == 1:
        current_X = current_X.reshape(-1, 1)

    n_features = baseline_X.shape[1]
    # Pad feature_names if necessary
    names: List[str] = list(feature_names)
    while len(names) < n_features:
        names.append(f"feature_{len(names)}")
    names = names[:n_features]

    features_report: dict[str, dict] = {}
    n_warning = 0
    n_critical = 0
    worst = "stable"

    for i, name in enumerate(names):
        psi = compute_psi(baseline_X[:, i], current_X[:, i])
        status = _psi_status(psi)
        features_report[name] = {"psi": round(psi, 6), "status": status}

        if status == "critical":
            n_critical += 1
            worst = "critical"
        elif status == "warning":
            n_warning += 1
            if worst != "critical":
                worst = "warning"

    return {
        "features": features_report,
        "global_status": worst,
        "n_features_warning": n_warning,
        "n_features_critical": n_critical,
        "computed_at": datetime.now(tz=timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# Prediction probability drift
# ---------------------------------------------------------------------------

def compute_prediction_drift(
    baseline_proba: np.ndarray,
    current_proba: np.ndarray,
) -> dict:
    """
    Compute PSI on predicted probability distributions for each output class.

    Parameters
    ----------
    baseline_proba:
        Array of shape ``(n_baseline, 3)`` — softmax probabilities for
        SHORT, NEUTRAL, LONG.
    current_proba:
        Array of shape ``(n_current, 3)``.

    Returns
    -------
    dict
        ``{"SHORT": psi, "NEUTRAL": psi, "LONG": psi, "mean_psi": float}``
    """
    baseline_proba = np.asarray(baseline_proba, dtype=np.float64)
    current_proba = np.asarray(current_proba, dtype=np.float64)

    if baseline_proba.ndim == 1:
        baseline_proba = baseline_proba.reshape(-1, 1)
    if current_proba.ndim == 1:
        current_proba = current_proba.reshape(-1, 1)

    n_classes = len(_CLASS_NAMES)
    result: dict[str, float] = {}
    psi_values: list[float] = []

    for i, cls_name in enumerate(_CLASS_NAMES):
        if i < baseline_proba.shape[1] and i < current_proba.shape[1]:
            psi = compute_psi(baseline_proba[:, i], current_proba[:, i])
        else:
            psi = 0.0
        result[cls_name] = round(psi, 6)
        psi_values.append(psi)

    result["mean_psi"] = round(float(np.mean(psi_values)) if psi_values else 0.0, 6)
    return result
