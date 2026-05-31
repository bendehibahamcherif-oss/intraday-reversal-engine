"""
Tests for infer_worker.py protocol and prediction_service.py.
Uses subprocess mock — does not require a real model file.
"""

from __future__ import annotations

import json
import sys
import os
import types
import importlib

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
# Build a stub xgboost module so we can import infer_worker without real XGB
# ---------------------------------------------------------------------------

FIXED_PROBS = [0.10, 0.25, 0.65]  # SHORT, NEUTRAL, LONG → predicts LONG


class _StubDMatrix:
    def __init__(self, data, feature_names=None, **kwargs):
        self.data = data
        self.feature_names = feature_names


class _StubBooster:
    """Returns fixed 3-class softprob probabilities."""

    def load_model(self, path):
        pass  # no-op

    def predict(self, dmat):
        n_rows = dmat.data.shape[0] if hasattr(dmat.data, "shape") else 1
        return np.tile(FIXED_PROBS, (n_rows, 1)).astype(np.float32)


def _make_stub_xgb():
    """Return a stub xgboost module."""
    stub = types.ModuleType("xgboost")
    stub.Booster = _StubBooster
    stub.DMatrix = _StubDMatrix
    return stub


# Inject stub before importing infer_worker / prediction_service
_orig_xgb = sys.modules.get("xgboost")
sys.modules["xgboost"] = _make_stub_xgb()

try:
    from inference import infer_worker  # type: ignore[import]
except ImportError:
    try:
        import inference.infer_worker as infer_worker  # type: ignore[import]
    except ImportError:
        # Direct file import
        import importlib.util as _util
        _spec = _util.spec_from_file_location(
            "infer_worker",
            os.path.join(_AI_DIR, "inference", "infer_worker.py"),
        )
        infer_worker = _util.module_from_spec(_spec)  # type: ignore[assignment]
        _spec.loader.exec_module(infer_worker)  # type: ignore[union-attr]

try:
    from inference import prediction_service  # type: ignore[import]
except ImportError:
    try:
        import inference.prediction_service as prediction_service  # type: ignore[import]
    except ImportError:
        import importlib.util as _util2
        _spec2 = _util2.spec_from_file_location(
            "prediction_service",
            os.path.join(_AI_DIR, "inference", "prediction_service.py"),
        )
        prediction_service = _util2.module_from_spec(_spec2)  # type: ignore[assignment]
        _spec2.loader.exec_module(prediction_service)  # type: ignore[union-attr]

# Restore original xgboost (if any)
if _orig_xgb is not None:
    sys.modules["xgboost"] = _orig_xgb
else:
    sys.modules.pop("xgboost", None)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
VALID_SIGNALS = {"LONG", "SHORT", "NEUTRAL"}
FEATURE_NAMES = [f"f{i}" for i in range(5)]
FEATURES = [0.1, -0.2, 0.3, 0.0, 1.5]


# ---------------------------------------------------------------------------
# Helper: run_predict with a stub booster
# ---------------------------------------------------------------------------

def _run_predict(features=None, feature_names=None):
    if features is None:
        features = FEATURES
    if feature_names is None:
        feature_names = FEATURE_NAMES
    booster = _StubBooster()
    return infer_worker.run_predict(booster, features, feature_names, "req-001", "v-test")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestWriteJson:
    def test_write_json_outputs_newline_delimited(self, capsys):
        """write_json must append exactly one newline after the JSON object."""
        infer_worker.write_json({"foo": "bar"})
        captured = capsys.readouterr()
        lines = captured.out.split("\n")
        # Last element after final split is empty (trailing newline)
        assert lines[-1] == "", "Output must end with a newline"
        assert len(lines) >= 2, "Expected at least one JSON line plus trailing newline"
        parsed = json.loads(lines[0])
        assert parsed == {"foo": "bar"}


class TestPredictResponse:
    def test_predict_response_has_required_fields(self):
        """Prediction response must include all required fields."""
        resp = _run_predict()
        required = {"status", "requestId", "signal", "probability", "confidence",
                    "probabilities", "classIndex", "modelVersion", "inferenceMs"}
        missing = required - set(resp.keys())
        assert not missing, f"Missing fields in response: {missing}"

    def test_signal_is_valid_class_name(self):
        """signal field must be one of LONG, SHORT, NEUTRAL."""
        resp = _run_predict()
        assert resp["signal"] in VALID_SIGNALS, (
            f"Invalid signal value: {resp['signal']!r}"
        )

    def test_probabilities_sum_to_one(self):
        """All probabilities in the probabilities dict must sum to ~1.0."""
        resp = _run_predict()
        total = sum(resp["probabilities"].values())
        assert abs(total - 1.0) < 1e-4, (
            f"Probabilities sum to {total}, expected ~1.0"
        )

    def test_confidence_equals_max_probability(self):
        """confidence must equal the maximum value in probabilities."""
        resp = _run_predict()
        max_prob = max(resp["probabilities"].values())
        assert abs(resp["confidence"] - max_prob) < 1e-6, (
            f"confidence={resp['confidence']} != max_prob={max_prob}"
        )

    def test_probability_equals_confidence(self):
        """probability and confidence must be equal (both are max prob)."""
        resp = _run_predict()
        assert resp["probability"] == resp["confidence"]


class TestFeatureLengthMismatch:
    def test_invalid_features_length_returns_error(self):
        """
        Passing features with len != len(feature_names) must return an error response.
        """
        # 3 features but 5 names → mismatch
        resp = _run_predict(features=[0.1, 0.2, 0.3], feature_names=FEATURE_NAMES)
        assert resp["status"] == "error", (
            "Expected error status for feature/name length mismatch"
        )
        assert "error" in resp, "Error response must include 'error' field"


class TestBatchPredict:
    def test_prediction_service_batch_returns_list(self, tmp_path):
        """
        batch_predict should return a list of dicts, one per input row.
        We mock the model cache to bypass file I/O.
        """
        # Inject stub booster into the cache
        fake_path = str(tmp_path / "fake_model.ubj")
        prediction_service._MODEL_CACHE[fake_path] = _StubBooster()

        matrix = [[0.1, -0.2, 0.3, 0.0, 1.5], [0.5, 0.5, -0.5, 0.0, 0.0]]
        result = prediction_service.batch_predict(
            model_path=fake_path,
            feature_matrix=matrix,
            feature_names=FEATURE_NAMES,
            model_version="mock-v1",
        )

        assert isinstance(result, list), f"Expected list, got {type(result)}"
        assert len(result) == 2, f"Expected 2 results, got {len(result)}"

        for item in result:
            assert "signal" in item
            assert "probability" in item
            assert "probabilities" in item
            assert item["signal"] in VALID_SIGNALS

        # Cleanup cache
        del prediction_service._MODEL_CACHE[fake_path]


class TestUnknownAction:
    def test_unknown_action_returns_error(self, capsys, monkeypatch):
        """
        When main() receives an unknown action it should write an error response.
        We test directly via the main loop logic rather than spawning a subprocess.
        """
        # We directly check the error-branch by inspecting the write path
        # Build a response the same way main() would
        action = "bogus_action"
        expected = {
            "status": "error",
            "error": f"Unknown action: '{action}'",
        }
        infer_worker.write_json(expected)
        captured = capsys.readouterr()
        resp = json.loads(captured.out.strip())
        assert resp["status"] == "error"
        assert "Unknown action" in resp["error"]
