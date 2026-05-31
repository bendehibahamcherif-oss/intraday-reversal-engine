"""
calibration.py — Model calibration using Platt scaling (sigmoid).

Wraps an XGBoost Booster or any sklearn-compatible classifier in
``CalibratedClassifierCV(cv="prefit", method="sigmoid")`` fitted on a
held-out validation set.

Platt scaling learns a logistic (sigmoid) transform of the raw model scores
to produce better-calibrated probabilities without refitting the underlying
estimator.

Reference:
    Platt, J. (1999). Probabilistic outputs for support vector machines and
    comparisons to regularized likelihood methods. Advances in large margin
    classifiers, 10(3), 61–74.
"""

from __future__ import annotations

import logging

import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import brier_score_loss

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def calibrate_model(
    base_estimator,
    X_val: np.ndarray,
    y_val: np.ndarray,
) -> CalibratedClassifierCV:
    """Fit Platt scaling (sigmoid calibration) on the validation set.

    The ``base_estimator`` is assumed to already be trained.  ``cv="prefit"``
    instructs ``CalibratedClassifierCV`` not to refit the base estimator —
    it only fits the sigmoid parameters on ``(X_val, y_val)``.

    Parameters
    ----------
    base_estimator:
        A fitted, sklearn-compatible estimator that implements
        ``predict_proba``.  Use :class:`XGBSklearnWrapper` to adapt a raw
        ``xgb.Booster``.
    X_val:
        Validation feature matrix of shape ``(n_val, n_features)``.
    y_val:
        Validation integer labels of shape ``(n_val,)``.

    Returns
    -------
    CalibratedClassifierCV
        Fitted calibrated classifier.  Call ``.predict_proba(X)`` for
        calibrated probability estimates.

    Notes
    -----
    Brier score improvement is logged at INFO level.  The Brier score is
    computed for the LONG class (label ``2``) before and after calibration.
    """
    # Brier score before calibration
    proba_before = base_estimator.predict_proba(X_val)
    brier_before = float(
        brier_score_loss(
            (y_val == 2).astype(int),
            proba_before[:, 2],
        )
    )

    # Fit Platt scaling
    calibrated = CalibratedClassifierCV(
        estimator=base_estimator,
        method="sigmoid",
        cv="prefit",
    )
    calibrated.fit(X_val, y_val)

    # Brier score after calibration
    proba_after = calibrated.predict_proba(X_val)
    brier_after = float(
        brier_score_loss(
            (y_val == 2).astype(int),
            proba_after[:, 2],
        )
    )

    improvement_pct = (
        (brier_before - brier_after) / (brier_before + 1e-12) * 100.0
    )

    logger.info(
        "calibrate_model: Brier (LONG) before=%.6f after=%.6f improvement=%.2f%%",
        brier_before,
        brier_after,
        improvement_pct,
    )

    return calibrated


def brier_improvement(
    y_true: np.ndarray,
    proba_before: np.ndarray,
    proba_after: np.ndarray,
) -> dict:
    """Compute Brier score improvement for the LONG class before and after calibration.

    Parameters
    ----------
    y_true:
        1-D integer array of ground-truth labels.
    proba_before:
        2-D probability array from the uncalibrated model, shape ``(n, 3)``.
    proba_after:
        2-D probability array from the calibrated model, shape ``(n, 3)``.

    Returns
    -------
    dict
        Keys:

        ``before``
            Brier score for LONG class before calibration.
        ``after``
            Brier score for LONG class after calibration.
        ``improvement_pct``
            Relative reduction as a percentage:
            ``(before - after) / (before + ε) * 100``.

        Positive ``improvement_pct`` means calibration reduced the Brier
        score (better).  Negative means it got worse.
    """
    y_binary = (y_true == 2).astype(int)

    before = float(brier_score_loss(y_binary, proba_before[:, 2]))
    after = float(brier_score_loss(y_binary, proba_after[:, 2]))
    improvement_pct = float((before - after) / (before + 1e-12) * 100.0)

    return {
        "before": before,
        "after": after,
        "improvement_pct": improvement_pct,
    }


# ---------------------------------------------------------------------------
# XGBoost sklearn wrapper
# ---------------------------------------------------------------------------


class XGBSklearnWrapper:
    """sklearn-compatible wrapper around a fitted ``xgb.Booster``.

    ``CalibratedClassifierCV`` requires an estimator that implements
    ``fit``, ``predict``, ``predict_proba``, and exposes a ``classes_``
    attribute.  ``xgb.Booster`` does not satisfy this interface directly;
    this wrapper provides the necessary bridge.

    Parameters
    ----------
    booster:
        A trained ``xgb.Booster`` instance.  ``predict()`` must return an
        array of shape ``(n_samples, n_classes)`` when used with
        ``output_margin=False`` (i.e. the model must use
        ``objective="multi:softprob"``).
    n_classes:
        Number of output classes.  Defaults to 3 (SHORT, NEUTRAL, LONG).

    Examples
    --------
    >>> wrapper = XGBSklearnWrapper(booster)
    >>> calibrated = CalibratedClassifierCV(wrapper, cv="prefit", method="sigmoid")
    >>> calibrated.fit(X_val, y_val)
    >>> proba = calibrated.predict_proba(X_test)
    """

    def __init__(self, booster, n_classes: int = 3) -> None:
        import xgboost as xgb  # local import — not required at module level

        if not isinstance(booster, xgb.Booster):
            raise TypeError(
                f"Expected xgb.Booster, got {type(booster).__name__}."
            )

        self._booster = booster
        self._n_classes = n_classes
        self.classes_ = np.arange(n_classes, dtype=np.int64)

    # ------------------------------------------------------------------
    # sklearn interface
    # ------------------------------------------------------------------

    def fit(self, X: np.ndarray, y: np.ndarray) -> "XGBSklearnWrapper":
        """No-op — the underlying Booster is already trained.

        Provided for sklearn compatibility (``CalibratedClassifierCV``
        calls ``fit`` when ``cv != "prefit"``; with ``cv="prefit"`` it
        will not call this method, but the signature must exist).
        """
        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Return class probability matrix.

        Parameters
        ----------
        X:
            Feature matrix of shape ``(n_samples, n_features)``.

        Returns
        -------
        np.ndarray
            Probability array of shape ``(n_samples, n_classes)``.
            Each row sums to 1.
        """
        import xgboost as xgb

        dmatrix = xgb.DMatrix(X)
        raw = self._booster.predict(dmatrix)

        # XGBoost multi:softprob outputs flat array of length n_samples*n_classes
        if raw.ndim == 1:
            n_samples = X.shape[0]
            raw = raw.reshape(n_samples, self._n_classes)

        return raw.astype(np.float64)

    def predict(self, X: np.ndarray) -> np.ndarray:
        """Return predicted class indices (argmax of probabilities).

        Parameters
        ----------
        X:
            Feature matrix of shape ``(n_samples, n_features)``.

        Returns
        -------
        np.ndarray
            Integer class predictions of shape ``(n_samples,)``.
        """
        return np.argmax(self.predict_proba(X), axis=1).astype(np.int64)

    # ------------------------------------------------------------------
    # Passthrough attributes expected by sklearn meta-estimators
    # ------------------------------------------------------------------

    def __repr__(self) -> str:
        return (
            f"XGBSklearnWrapper(n_classes={self._n_classes}, "
            f"booster_ntrees={self._booster.num_boosted_rounds()})"
        )
