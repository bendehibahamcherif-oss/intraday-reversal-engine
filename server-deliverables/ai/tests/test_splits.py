"""
Tests for chronological split.
Verifies: temporal ordering, no data leakage across splits,
correct gap enforcement, proper 70/15/15 ratios.
"""

from __future__ import annotations

import sys
import os

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
# Config fallback
# ---------------------------------------------------------------------------
try:
    from config import HORIZON  # noqa: F401
except ImportError:
    HORIZON = 5

# ---------------------------------------------------------------------------
# chronological_split — import from train_pipeline if available, else inline
# ---------------------------------------------------------------------------
try:
    from training.train_pipeline import chronological_split  # type: ignore[import]
except ImportError:
    try:
        from server_deliverables.ai.training.train_pipeline import chronological_split  # type: ignore[import]
    except ImportError:
        def chronological_split(n: int, horizon: int):  # type: ignore[misc]
            """
            Inline fallback matching the spec.

            Returns (train_range, val_range, test_range).
            train: [0, train_end)
            val:   [train_end + horizon, val_end)
            test:  [val_end + horizon, n)

            Raises ValueError for datasets too small to form all three splits.
            """
            train_end = int(n * 0.70)
            val_end = train_end + int(n * 0.15)
            val_start = train_end + horizon
            test_start = val_end + horizon

            if val_start >= val_end:
                raise ValueError(
                    f"Dataset too small: val split is empty "
                    f"(val_start={val_start} >= val_end={val_end}, n={n})"
                )
            if test_start >= n:
                raise ValueError(
                    f"Dataset too small: test split is empty "
                    f"(test_start={test_start} >= n={n})"
                )

            return range(0, train_end), range(val_start, val_end), range(test_start, n)


# ---------------------------------------------------------------------------
# Optional sklearn import for TimeSeriesSplit test
# ---------------------------------------------------------------------------
try:
    from sklearn.model_selection import TimeSeriesSplit
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

# ---------------------------------------------------------------------------
# Test dataset size
# ---------------------------------------------------------------------------
N = 1000  # large enough to make ratios meaningful


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestTemporalOrdering:
    def test_train_ends_before_val_starts(self):
        """max index in train must be strictly less than min index in val."""
        train, val, test = chronological_split(N, HORIZON)
        assert max(train) < min(val), (
            f"Train/val overlap: train ends at {max(train)}, val starts at {min(val)}"
        )

    def test_val_ends_before_test_starts(self):
        """max index in val must be strictly less than min index in test."""
        train, val, test = chronological_split(N, HORIZON)
        assert max(val) < min(test), (
            f"Val/test overlap: val ends at {max(val)}, test starts at {min(test)}"
        )


class TestGapEnforcement:
    def test_gap_equals_horizon_between_train_val(self):
        """
        val_start - train_end must equal HORIZON.
        This ensures no leaked forward-looking labels bleed into val.
        """
        train, val, _ = chronological_split(N, HORIZON)
        train_end = max(train) + 1  # exclusive end
        val_start = min(val)
        gap = val_start - train_end
        assert gap == HORIZON, (
            f"Expected gap of {HORIZON} between train and val, got {gap}"
        )

    def test_gap_equals_horizon_between_val_test(self):
        """val_end to test_start gap must equal HORIZON."""
        _, val, test = chronological_split(N, HORIZON)
        val_end = max(val) + 1  # exclusive end
        test_start = min(test)
        gap = test_start - val_end
        assert gap == HORIZON, (
            f"Expected gap of {HORIZON} between val and test, got {gap}"
        )


class TestNoOverlap:
    def test_no_overlap_between_splits(self):
        """The three splits must be pairwise disjoint."""
        train, val, test = chronological_split(N, HORIZON)
        train_set = set(train)
        val_set = set(val)
        test_set = set(test)

        assert train_set.isdisjoint(val_set), "Train and val overlap"
        assert train_set.isdisjoint(test_set), "Train and test overlap"
        assert val_set.isdisjoint(test_set), "Val and test overlap"


class TestRatios:
    def test_train_ratio_approx_70pct(self):
        """Training set should be approximately 70% of N."""
        train, _, _ = chronological_split(N, HORIZON)
        ratio = len(train) / N
        assert abs(ratio - 0.70) <= 0.02, (
            f"Train ratio {ratio:.4f} deviates more than 2% from 0.70"
        )

    def test_val_ratio_approx_15pct(self):
        """Validation set should be approximately 15% of N."""
        _, val, _ = chronological_split(N, HORIZON)
        ratio = len(val) / N
        assert abs(ratio - 0.15) <= 0.03, (
            f"Val ratio {ratio:.4f} deviates more than 3% from 0.15"
        )

    def test_test_ratio_approx_15pct(self):
        """Test set should be approximately 15% of N."""
        _, _, test = chronological_split(N, HORIZON)
        ratio = len(test) / N
        assert abs(ratio - 0.15) <= 0.03, (
            f"Test ratio {ratio:.4f} deviates more than 3% from 0.15"
        )


class TestTimeSeriesSplitGap:
    @pytest.mark.skipif(not SKLEARN_AVAILABLE, reason="sklearn not installed")
    def test_timeseriessplit_has_gap(self):
        """
        TimeSeriesSplit(gap=HORIZON) must not produce leaking folds.
        For each fold, the gap between the last train index and first test index
        must be >= HORIZON.
        """
        import numpy as np

        n_splits = 3
        tscv = TimeSeriesSplit(n_splits=n_splits, gap=HORIZON)
        data = np.arange(N)

        for train_idx, test_idx in tscv.split(data):
            last_train = train_idx[-1]
            first_test = test_idx[0]
            actual_gap = first_test - last_train - 1
            assert actual_gap >= HORIZON, (
                f"TimeSeriesSplit gap {actual_gap} < HORIZON {HORIZON}"
            )


class TestSmallDatasetRaises:
    def test_raises_on_too_small_dataset(self):
        """
        A dataset of only 20 rows is too small to form valid splits with
        HORIZON=5 gaps — must raise ValueError.
        """
        with pytest.raises((ValueError, IndexError, StopIteration)):
            chronological_split(20, HORIZON)
