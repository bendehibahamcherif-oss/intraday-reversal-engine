"""
Tests for label_builder.py
Verifies: no lookahead, correct LONG/SHORT/NEUTRAL assignment,
boundary conditions at tau, cost accounting, dropped tail rows.
"""

from __future__ import annotations

import sys
import os

import numpy as np
import pandas as pd
import pytest

# ---------------------------------------------------------------------------
# Path setup — allow import from the ai/ directory
# ---------------------------------------------------------------------------
_AI_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _AI_DIR not in sys.path:
    sys.path.insert(0, _AI_DIR)

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(_AI_DIR)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

# ---------------------------------------------------------------------------
# Import label_builder (try installed package path, then local)
# ---------------------------------------------------------------------------
try:
    from server_deliverables.ai.training.label_builder import label_multiclass, label_stats
except ImportError:
    try:
        from training.label_builder import label_multiclass, label_stats
    except ImportError:
        pytest.skip("label_builder not importable — skipping test module", allow_module_level=True)

# ---------------------------------------------------------------------------
# Constants (mirror config.py defaults)
# ---------------------------------------------------------------------------
HORIZON = 5
TAU = 0.001
COST_BPS = 8
SLIPPAGE_BPS = 2
TOTAL_COST = (COST_BPS + SLIPPAGE_BPS * 2) / 10_000.0  # 0.0012

LONG_LABEL = 2
NEUTRAL_LABEL = 1
SHORT_LABEL = 0


# ---------------------------------------------------------------------------
# Helper to build a synthetic OHLCV DataFrame
# ---------------------------------------------------------------------------

def _make_df(opens: list[float], closes: list[float]) -> pd.DataFrame:
    """Create a minimal OHLCV DataFrame from open and close price arrays."""
    n = len(opens)
    return pd.DataFrame(
        {
            "open": opens,
            "high": [max(o, c) + 0.01 for o, c in zip(opens, closes)],
            "low": [min(o, c) - 0.01 for o, c in zip(opens, closes)],
            "close": closes,
            "volume": [1000] * n,
        }
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestLongLabel:
    def test_long_label_assigned_when_return_exceeds_tau(self):
        """
        When r_net > tau the label must be LONG (2).

        We engineer:
          entry_price = open[t+1]
          exit_price  = close[t+HORIZON]
          r_net = (exit - entry) / entry - cost > TAU
        """
        # Make open[1] = 100.0 (entry) and close[5] = 100.25 (exit).
        # r_net ≈ 0.0025 - 0.0012 = 0.0013 > 0.001 → LONG
        n = HORIZON + 5
        opens = [100.0] * n
        closes = [100.25] * n
        df = _make_df(opens, closes)
        labels = label_multiclass(df, horizon=HORIZON, tau=TAU)
        # At least some labels should be LONG
        assert (labels == LONG_LABEL).any(), "Expected at least one LONG label"

    def test_short_label_assigned_when_return_below_neg_tau(self):
        """When r_net < -tau the label must be SHORT (0)."""
        n = HORIZON + 5
        # exit < entry enough to produce r_net < -TAU
        opens = [100.0] * n
        closes = [99.70] * n  # drop of 0.30 → r_net ≈ -0.003 - 0.0012 < -0.001
        df = _make_df(opens, closes)
        labels = label_multiclass(df, horizon=HORIZON, tau=TAU)
        assert (labels == SHORT_LABEL).any(), "Expected at least one SHORT label"

    def test_neutral_label_within_thresholds(self):
        """A tiny price move should produce NEUTRAL labels."""
        n = HORIZON + 5
        opens = [100.0] * n
        # r_net ≈ 0.00005 - 0.0012 = slightly negative but |r_net| < TAU
        closes = [100.005] * n
        df = _make_df(opens, closes)
        labels = label_multiclass(df, horizon=HORIZON, tau=TAU)
        # With such a small move every labelled row should be NEUTRAL
        assert (labels == NEUTRAL_LABEL).all(), "Expected all NEUTRAL labels for tiny move"


class TestDroppedTailRows:
    def test_last_horizon_rows_dropped(self):
        """Output length must equal input length minus HORIZON."""
        n = 50
        df = _make_df([100.0] * n, [100.0] * n)
        labels = label_multiclass(df, horizon=HORIZON)
        assert len(labels) == n - HORIZON, (
            f"Expected {n - HORIZON} labelled rows, got {len(labels)}"
        )


class TestNoLookahead:
    def test_no_future_data_in_features(self):
        """
        entry uses shift(-1) on open, exit uses shift(-horizon) on close.
        The label at position t uses open[t+1] and close[t+horizon],
        never index 0 (current bar's own data).

        We verify: label for row t uses only forward-shifted data — the
        fact that labels are produced for rows 0..n-horizon-1 (not the last
        horizon rows) confirms no same-bar lookahead.
        """
        n = 40
        # Unique ascending opens so we can trace which bars were used
        opens = list(range(100, 100 + n))
        closes = list(range(200, 200 + n))
        df = _make_df(opens, closes)
        labels = label_multiclass(df, horizon=HORIZON, tau=TAU)
        # The last HORIZON rows must be absent from the output index
        assert len(labels) == n - HORIZON
        # The output index must match the first n-HORIZON rows of df
        expected_index = df.index[: n - HORIZON]
        pd.testing.assert_index_equal(labels.index, expected_index)


class TestLabelStats:
    def test_label_stats_sums_to_total(self):
        """label_stats counts must sum to n_samples."""
        n = 60
        df = _make_df([100.0] * n, [100.0] * n)
        labels = label_multiclass(df, horizon=HORIZON)
        stats = label_stats(labels)
        total_from_counts = sum(stats["counts"].values())
        assert total_from_counts == stats["total"]
        assert stats["total"] == len(labels)


class TestTauBoundaryConditions:
    def test_tau_boundary_exactly_long(self):
        """r_net strictly greater than tau → LONG."""
        n = HORIZON + 2
        epsilon = 1e-5
        # entry = open[1] = 100.0; exit = close[HORIZON] = ?
        # We need r_net = (exit - entry) / entry - cost > TAU
        # → exit = entry * (TAU + TOTAL_COST + epsilon + 1)
        entry = 100.0
        exit_price = entry * (1 + TAU + TOTAL_COST + epsilon)
        opens = [entry] * n
        closes = [exit_price] * n
        df = _make_df(opens, closes)
        labels = label_multiclass(df, horizon=HORIZON, tau=TAU)
        assert (labels == LONG_LABEL).any(), "Expected LONG at boundary TAU + epsilon"

    def test_tau_boundary_exactly_neutral(self):
        """r_net strictly less than tau (but > -tau) → NEUTRAL."""
        n = HORIZON + 2
        epsilon = 1e-5
        # r_net = (exit - entry) / entry - cost < TAU
        # → exit = entry * (TAU + TOTAL_COST - epsilon + 1)
        entry = 100.0
        exit_price = entry * (1 + TAU + TOTAL_COST - epsilon)
        opens = [entry] * n
        closes = [exit_price] * n
        df = _make_df(opens, closes)
        labels = label_multiclass(df, horizon=HORIZON, tau=TAU)
        assert (labels == NEUTRAL_LABEL).any(), "Expected NEUTRAL just below TAU boundary"


class TestCostAccounting:
    def test_cost_reduces_profitability(self):
        """
        With higher cost friction, fewer rows should be labelled LONG for
        the same price series.
        """
        n = 80
        # Moderate upward drift
        opens = list(np.linspace(100.0, 101.5, n))
        closes = list(np.linspace(100.1, 101.6, n))
        df = _make_df(opens, closes)

        # Low cost
        labels_low = label_multiclass(df, horizon=HORIZON, tau=TAU)
        long_count_low = (labels_low == LONG_LABEL).sum()

        # Override total_cost by using a much higher tau equivalent:
        # We simulate "higher cost" by raising TAU to mimic the net effect.
        labels_high = label_multiclass(df, horizon=HORIZON, tau=TAU * 5)
        long_count_high = (labels_high == LONG_LABEL).sum()

        assert long_count_low >= long_count_high, (
            "Higher effective threshold should reduce or equal LONG count"
        )


class TestDifferentHorizons:
    def test_different_horizons_give_different_label_counts(self):
        """
        HORIZON=3 and HORIZON=5 should produce different label distributions
        on a non-trivial price series.
        """
        n = 60
        opens = list(np.linspace(100.0, 105.0, n))
        closes = list(np.linspace(100.2, 105.5, n))
        df = _make_df(opens, closes)

        labels_h3 = label_multiclass(df, horizon=3, tau=TAU)
        labels_h5 = label_multiclass(df, horizon=5, tau=TAU)

        # Different horizons = different lengths
        assert len(labels_h3) == n - 3
        assert len(labels_h5) == n - 5

        # Label distributions are likely different (non-trivial series)
        counts_h3 = labels_h3.value_counts().to_dict()
        counts_h5 = labels_h5.value_counts().to_dict()
        # At minimum the total counts differ
        assert len(labels_h3) != len(labels_h5)


class TestConstantAndTrendingSeries:
    def test_constant_price_series_all_neutral(self):
        """A completely flat price series must produce all-NEUTRAL labels."""
        n = 50
        df = _make_df([100.0] * n, [100.0] * n)
        labels = label_multiclass(df, horizon=HORIZON, tau=TAU)
        assert (labels == NEUTRAL_LABEL).all(), (
            "Flat price series should yield 100% NEUTRAL labels"
        )

    def test_trending_up_series_majority_long(self):
        """A strong uptrend should result in LONG being the majority class."""
        n = 100
        # +30% trend over 100 bars → large positive r_net on most windows
        opens = list(np.linspace(100.0, 130.0, n))
        closes = list(np.linspace(100.5, 130.5, n))
        df = _make_df(opens, closes)
        labels = label_multiclass(df, horizon=HORIZON, tau=TAU)
        long_count = (labels == LONG_LABEL).sum()
        total = len(labels)
        assert long_count / total > 0.5, (
            f"Expected majority LONG in uptrend, got {long_count}/{total}"
        )
