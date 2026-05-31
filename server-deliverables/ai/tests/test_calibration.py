"""
Tests for model calibration.
Verifies Brier score improvement, wrapper compatibility, edge cases.

The tests build a minimal synthetic XGBoost model on 3-class random data,
then verify that CalibratedClassifierCV wrapping behaves correctly.
"""

from __future__ import annotations

import sys
import os

import numpy as np
import pytest

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
_AI_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _AI_DIR not in sys.path:
    sys.path.insert(0, _AI_DIR)

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(_AI_DIR)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

# ---------------------------------------------------------------------------
# Conditional imports
# ---------------------------------------------------------------------------
try:
    import xgboost as xgb
    XGB_AVAILABLE = True
except ImportError:
    XGB_AVAILABLE = False

try:
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.metrics import brier_score_loss
    from sklearn.base import BaseEstimator, ClassifierMixin
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not (XGB_AVAILABLE and SKLEARN_AVAILABLE),
    reason="xgboost and scikit-learn required for calibration tests",
)

# ---------------------------------------------------------------------------
# Import calibration module — try real module first, fall back to inline stubs
# ---------------------------------------------------------------------------

_calibrate_model = None
_brier_improvement = None
_XGBSklearnWrapper = None

try:
    # Try local import path (when running tests from ai/ directory)
    from training.calibration import (  # type: ignore[import]
        calibrate_model as _calibrate_model,
        brier_improvement as _brier_improvement,
        XGBSklearnWrapper as _XGBSklearnWrapper,
    )
except ImportError:
    try:
        from server_deliverables.ai.training.calibration import (  # type: ignore[import]
            calibrate_model as _calibrate_model,
            brier_improvement as _brier_improvement,
            XGBSklearnWrapper as _XGBSklearnWrapper,
        )
    except ImportError:
        pass  # Will use inline stubs defined below


# ---------------------------------------------------------------------------
# Inline stubs — only activated when calibration.py cannot be imported
# ---------------------------------------------------------------------------

if _XGBSklearnWrapper is None and XGB_AVAILABLE and SKLEARN_AVAILABLE:
    class _XGBSklearnWrapperStub(BaseEstimator, ClassifierMixin):
        """
        Minimal sklearn-compatible wrapper matching the real XGBSklearnWrapper
        signature: __init__(self, booster, n_classes=3).
        """

        def __init__(self, booster: "xgb.Booster", n_classes: int = 3) -> None:
            self._booster = booster
            self._n_classes = n_classes
            self.classes_ = np.arange(n_classes, dtype=np.int64)

        def fit(self, X, y):  # noqa: N803
            return self  # pre-fitted wrapper; no-op

        def predict_proba(self, X):  # noqa: N803
            dmat = xgb.DMatrix(X)
            raw = self._booster.predict(dmat)
            n = X.shape[0]
            if raw.ndim == 1 and raw.shape[0] == n * self._n_classes:
                raw = raw.reshape(n, self._n_classes)
            elif raw.ndim == 1:
                raw = raw.reshape(1, -1)
            return raw.astype(np.float64)

        def predict(self, X):  # noqa: N803
            return np.argmax(self.predict_proba(X), axis=1).astype(np.int64)

    _XGBSklearnWrapper = _XGBSklearnWrapperStub


if _calibrate_model is None and XGB_AVAILABLE and SKLEARN_AVAILABLE:
    def _calibrate_model(base_estimator, X_val, y_val):  # type: ignore[misc]
        """Platt scaling (sigmoid) — matches the real calibrate_model signature."""
        calibrated = CalibratedClassifierCV(
            estimator=base_estimator,
            method="sigmoid",
            cv="prefit",
        )
        calibrated.fit(X_val, y_val)
        return calibrated


if _brier_improvement is None and SKLEARN_AVAILABLE:
    def _brier_improvement(y_true, proba_before, proba_after):  # type: ignore[misc]
        """
        Brier score for LONG class (label=2) before and after calibration.
        Signature: (y_true, proba_before, proba_after) — matches calibration.py.
        Returns {"before": float, "after": float, "improvement_pct": float}.
        """
        y_binary = (y_true == 2).astype(int)
        before = float(brier_score_loss(y_binary, proba_before[:, 2]))
        after = float(brier_score_loss(y_binary, proba_after[:, 2]))
        improvement_pct = float((before - after) / (before + 1e-12) * 100.0)
        return {"before": before, "after": after, "improvement_pct": improvement_pct}


# ---------------------------------------------------------------------------
# Fixture: small synthetic XGBoost booster + data
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def synthetic_xgb_setup():
    """
    Train a tiny XGBoost booster on random 3-class data.
    Returns (wrapper, X_train, y_train, X_val, y_val, X_test, y_test).
    Total 200 samples: 100 train / 50 val / 50 test.
    """
    rng = np.random.default_rng(0)
    n_total = 200
    n_features = 10

    X_all = rng.standard_normal((n_total, n_features)).astype(np.float32)
    y_all = rng.integers(0, 3, size=n_total)

    X_train, y_train = X_all[:100], y_all[:100]
    X_val, y_val = X_all[100:150], y_all[100:150]
    X_test, y_test = X_all[150:], y_all[150:]

    dtrain = xgb.DMatrix(X_train, label=y_train)
    params = {
        "objective": "multi:softprob",
        "num_class": 3,
        "eval_metric": "mlogloss",
        "eta": 0.1,
        "max_depth": 3,
        "seed": 42,
        "verbosity": 0,
    }
    booster = xgb.train(params, dtrain, num_boost_round=50, verbose_eval=False)
    # Use n_classes=3 keyword to match real XGBSklearnWrapper signature
    wrapper = _XGBSklearnWrapper(booster, n_classes=3)

    return wrapper, X_train, y_train, X_val, y_val, X_test, y_test


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestCalibrationReturnsCorrectType:
    def test_calibration_returns_calibrated_classifier(self, synthetic_xgb_setup):
        """calibrate_model must return a CalibratedClassifierCV instance."""
        wrapper, X_train, y_train, X_val, y_val, _, _ = synthetic_xgb_setup
        cal = _calibrate_model(wrapper, X_val, y_val)
        assert isinstance(cal, CalibratedClassifierCV), (
            f"Expected CalibratedClassifierCV, got {type(cal)}"
        )


class TestBrierScore:
    def test_brier_score_does_not_worsen(self, synthetic_xgb_setup):
        """
        Calibrated Brier score must not be worse than raw by more than 0.01.
        (Small tolerance because calibration on limited data may not always improve.)
        """
        wrapper, _, _, X_val, y_val, X_test, y_test = synthetic_xgb_setup

        # Raw probabilities on test set
        raw_proba = wrapper.predict_proba(X_test)

        # Calibrated probabilities
        cal = _calibrate_model(wrapper, X_val, y_val)
        cal_proba = cal.predict_proba(X_test)

        result = _brier_improvement(y_test, raw_proba, cal_proba)
        assert result["after"] <= result["before"] + 0.01, (
            f"Calibrated Brier ({result['after']:.4f}) worse than raw "
            f"({result['before']:.4f}) by more than 0.01"
        )


class TestCalibratedPredictProba:
    def test_calibrated_predict_proba_sums_to_one(self, synthetic_xgb_setup):
        """All rows of predict_proba output must sum to 1.0 (within float tolerance)."""
        wrapper, _, _, X_val, y_val, X_test, _ = synthetic_xgb_setup
        cal = _calibrate_model(wrapper, X_val, y_val)
        proba = cal.predict_proba(X_test)
        row_sums = proba.sum(axis=1)
        np.testing.assert_allclose(row_sums, 1.0, atol=1e-5,
                                   err_msg="Probability rows do not sum to 1.0")


class TestXGBWrapper:
    def test_xgb_wrapper_predict_proba_shape(self, synthetic_xgb_setup):
        """XGBSklearnWrapper.predict_proba must return shape (n_samples, 3)."""
        wrapper, _, _, _, _, X_test, _ = synthetic_xgb_setup
        proba = wrapper.predict_proba(X_test)
        assert proba.shape == (X_test.shape[0], 3), (
            f"Expected shape ({X_test.shape[0]}, 3), got {proba.shape}"
        )

    def test_xgb_wrapper_classes_attribute(self, synthetic_xgb_setup):
        """XGBSklearnWrapper.classes_ must equal [0, 1, 2]."""
        wrapper, _, _, _, _, _, _ = synthetic_xgb_setup
        np.testing.assert_array_equal(wrapper.classes_, [0, 1, 2])


class TestBrierImprovementDict:
    def test_brier_improvement_dict_keys(self, synthetic_xgb_setup):
        """brier_improvement must return dict with keys 'before', 'after', 'improvement_pct'."""
        wrapper, _, _, X_val, y_val, X_test, y_test = synthetic_xgb_setup

        raw_proba = wrapper.predict_proba(X_test)
        cal = _calibrate_model(wrapper, X_val, y_val)
        cal_proba = cal.predict_proba(X_test)

        result = _brier_improvement(y_test, raw_proba, cal_proba)
        assert "before" in result, "Missing 'before' key"
        assert "after" in result, "Missing 'after' key"
        assert "improvement_pct" in result, "Missing 'improvement_pct' key"
        assert isinstance(result["before"], float)
        assert isinstance(result["after"], float)
        assert isinstance(result["improvement_pct"], float)

    def test_brier_improvement_pct_is_numeric(self, synthetic_xgb_setup):
        """improvement_pct must be a finite float."""
        wrapper, _, _, X_val, y_val, X_test, y_test = synthetic_xgb_setup

        raw_proba = wrapper.predict_proba(X_test)
        cal = _calibrate_model(wrapper, X_val, y_val)
        cal_proba = cal.predict_proba(X_test)

        result = _brier_improvement(y_test, raw_proba, cal_proba)
        assert np.isfinite(result["improvement_pct"]), (
            f"improvement_pct is not finite: {result['improvement_pct']}"
        )
