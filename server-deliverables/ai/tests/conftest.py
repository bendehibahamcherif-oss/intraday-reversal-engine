"""
conftest.py — Shared pytest fixtures for the ML Signal Engine test suite.
"""

from __future__ import annotations

import sys
import os

import numpy as np
import pandas as pd
import pytest

# ---------------------------------------------------------------------------
# Ensure project root is importable
# ---------------------------------------------------------------------------
_AI_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _AI_DIR not in sys.path:
    sys.path.insert(0, _AI_DIR)

# Also add the repo root so ``server_deliverables`` package resolves
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(_AI_DIR)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)


# ---------------------------------------------------------------------------
# Default constants (mirrors config.py)
# ---------------------------------------------------------------------------
HORIZON = 5
TAU = 0.001
COST_BPS = 8
SLIPPAGE_BPS = 2


# ---------------------------------------------------------------------------
# Synthetic OHLCV fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def flat_price_df() -> pd.DataFrame:
    """DataFrame with constant close/open prices — should yield all-NEUTRAL labels."""
    n = 100
    price = 100.0
    return pd.DataFrame(
        {
            "open": [price] * n,
            "high": [price + 0.01] * n,
            "low": [price - 0.01] * n,
            "close": [price] * n,
            "volume": [1000] * n,
        }
    )


@pytest.fixture()
def trending_up_df() -> pd.DataFrame:
    """DataFrame with a strong uptrend — majority of labels should be LONG."""
    n = 100
    prices = np.linspace(100.0, 130.0, n)  # +30% over 100 bars
    return pd.DataFrame(
        {
            "open": prices,
            "high": prices + 0.5,
            "low": prices - 0.5,
            "close": prices + 0.3,  # close slightly above open
            "volume": [1000] * n,
        }
    )


@pytest.fixture()
def small_ohlcv_df() -> pd.DataFrame:
    """Minimal OHLCV DataFrame with 30 rows for boundary tests."""
    n = 30
    prices = np.linspace(50.0, 55.0, n)
    return pd.DataFrame(
        {
            "open": prices,
            "high": prices + 0.1,
            "low": prices - 0.1,
            "close": prices + 0.05,
            "volume": [500] * n,
        }
    )


@pytest.fixture()
def random_feature_matrix() -> np.ndarray:
    """Random (100, 10) feature matrix for drift / PSI tests."""
    rng = np.random.default_rng(42)
    return rng.standard_normal((100, 10))


@pytest.fixture()
def shifted_feature_matrix() -> np.ndarray:
    """Feature matrix strongly shifted from the baseline — should trigger PSI alerts."""
    rng = np.random.default_rng(7)
    return rng.standard_normal((100, 10)) + 5.0  # mean shifted by +5


@pytest.fixture()
def feature_names_10() -> list[str]:
    """Ten generic feature names."""
    return [f"feat_{i}" for i in range(10)]
