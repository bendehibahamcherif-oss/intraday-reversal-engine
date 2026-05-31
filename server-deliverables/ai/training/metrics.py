"""
metrics.py — Metrics computation for multi-class classification.

All metrics are computed using scikit-learn.  The module is stateless:
every function accepts arrays and returns plain Python dicts suitable
for JSON serialisation.
"""

from __future__ import annotations

import logging

import numpy as np
from sklearn.calibration import calibration_curve as sk_calibration_curve
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
    roc_auc_score,
)

from server_deliverables.ai.config import IDX_TO_CLASS

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compute_all_metrics(
    y_true: np.ndarray,
    y_pred_proba: np.ndarray,
    split_label: str = "test",
) -> dict:
    """Compute the full suite of multi-class evaluation metrics.

    Parameters
    ----------
    y_true:
        1-D integer array of ground-truth class labels (0=SHORT, 1=NEUTRAL, 2=LONG).
        Shape: ``(n_samples,)``.
    y_pred_proba:
        2-D float array of predicted class probabilities.
        Shape: ``(n_samples, 3)`` — columns correspond to SHORT, NEUTRAL, LONG.
    split_label:
        Human-readable name for the data split being evaluated (e.g. ``"test"``,
        ``"val"``).  Stored verbatim in the returned dict.

    Returns
    -------
    dict
        Keys:

        ``accuracy``        — fraction of correctly classified samples.
        ``f1_macro``        — macro-averaged F1 score across all three classes.
        ``roc_auc_macro``   — macro-averaged one-vs-rest AUC-ROC.
        ``brier_long``      — Brier score for the LONG class (y_true==2 vs proba[:,2]).
        ``per_class``       — dict keyed by class name with precision/recall/f1/support.
        ``class_distribution`` — sample counts per class.
        ``confusion_matrix``   — list[list[int]] (rows = true, cols = predicted).
        ``split_label``     — echoes the input ``split_label`` argument.

    Notes
    -----
    * ``roc_auc_score`` uses ``multi_class="ovr"`` (one-vs-rest) and ``average="macro"``.
    * The Brier score for the LONG class is computed as::

          brier_score_loss(y_true == 2, y_pred_proba[:, 2])

    * ``confusion_matrix`` rows are ordered [SHORT, NEUTRAL, LONG] (label 0, 1, 2).
    """
    y_pred_class = np.argmax(y_pred_proba, axis=1)

    # ------------------------------------------------------------------
    # Scalar metrics
    # ------------------------------------------------------------------
    accuracy = float(accuracy_score(y_true, y_pred_class))

    f1_macro = float(
        f1_score(y_true, y_pred_class, average="macro", zero_division=0)
    )

    try:
        roc_auc_macro = float(
            roc_auc_score(
                y_true,
                y_pred_proba,
                multi_class="ovr",
                average="macro",
            )
        )
    except ValueError:
        # Can happen when only one class is present in a small split.
        roc_auc_macro = float("nan")
        logger.warning(
            "compute_all_metrics: roc_auc_score raised ValueError for split='%s'. "
            "Setting roc_auc_macro=NaN.",
            split_label,
        )

    # Brier score for LONG class (binary)
    brier_long = float(
        brier_score_loss(
            (y_true == 2).astype(int),
            y_pred_proba[:, 2],
        )
    )

    # ------------------------------------------------------------------
    # Per-class precision / recall / F1 / support
    # ------------------------------------------------------------------
    precision_arr, recall_arr, f1_arr, support_arr = precision_recall_fscore_support(
        y_true,
        y_pred_class,
        labels=[0, 1, 2],
        zero_division=0,
    )

    per_class: dict[str, dict] = {}
    for idx, class_name in IDX_TO_CLASS.items():
        per_class[class_name] = {
            "precision": float(precision_arr[idx]),
            "recall": float(recall_arr[idx]),
            "f1": float(f1_arr[idx]),
            "support": int(support_arr[idx]),
        }

    # ------------------------------------------------------------------
    # Class distribution (true label counts)
    # ------------------------------------------------------------------
    class_distribution: dict[str, int] = {}
    for idx, class_name in IDX_TO_CLASS.items():
        class_distribution[class_name] = int((y_true == idx).sum())

    # ------------------------------------------------------------------
    # Confusion matrix
    # ------------------------------------------------------------------
    cm = confusion_matrix(y_true, y_pred_class, labels=[0, 1, 2])
    cm_list: list[list[int]] = cm.tolist()

    return {
        "accuracy": accuracy,
        "f1_macro": f1_macro,
        "roc_auc_macro": roc_auc_macro,
        "brier_long": brier_long,
        "per_class": per_class,
        "class_distribution": class_distribution,
        "confusion_matrix": cm_list,
        "split_label": split_label,
    }


def calibration_curve_data(
    y_true: np.ndarray,
    y_proba_long: np.ndarray,
    n_bins: int = 10,
) -> dict:
    """Compute reliability-curve data for the LONG class.

    The reliability curve (calibration curve) plots the fraction of true
    positives in each predicted-probability bin against the mean predicted
    probability in that bin.  A perfectly calibrated model follows the
    diagonal.

    Parameters
    ----------
    y_true:
        1-D integer array of ground-truth labels.  The LONG class corresponds
        to label ``2``.
    y_proba_long:
        1-D float array of predicted probabilities for the LONG class.
        Shape: ``(n_samples,)``.
    n_bins:
        Number of equal-width bins to use.  Defaults to 10.

    Returns
    -------
    dict
        Keys:

        ``fraction_of_positives``
            List[float] — empirical fraction of LONG samples in each bin.
        ``mean_predicted_value``
            List[float] — mean predicted probability in each bin.
        ``n_bins``
            Actual number of bins used (may be less than requested if some
            bins are empty; scikit-learn handles this silently).
    """
    y_binary = (y_true == 2).astype(int)

    fraction_of_positives, mean_predicted_value = sk_calibration_curve(
        y_binary,
        y_proba_long,
        n_bins=n_bins,
        strategy="uniform",
    )

    return {
        "fraction_of_positives": fraction_of_positives.tolist(),
        "mean_predicted_value": mean_predicted_value.tolist(),
        "n_bins": len(fraction_of_positives),
    }
