"""
feature_builder.py — Feature engineering for the P1 intraday-reversal ML pipeline.

All features are computed as-of time t using only data available at t.
No lookahead is introduced: rolling windows, shifts, and indicators all
reference t or earlier bars only.

Expected input columns:
    open, high, low, close, volume, vwap, poc, vah, val,
    spread, bid_vol, ask_vol, cvd, up_imbalance, down_imbalance

The index must be a DatetimeIndex (or have hour/dayofweek accessible via
pandas dt accessor).
"""

from __future__ import annotations

import logging
from typing import Final

import numpy as np
import pandas as pd

from server_deliverables.ai.config import FEATURE_VERSION  # noqa: F401

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Feature family constants
# ---------------------------------------------------------------------------

_PRICE_ACTION: Final[str] = "price_action"
_VOLATILITY: Final[str] = "volatility"
_VOLUME: Final[str] = "volume"
_VOLUME_PROFILE: Final[str] = "volume_profile"
_ORDERFLOW: Final[str] = "orderflow"
_FOOTPRINT_CVD: Final[str] = "footprint_cvd"
_SESSION_TIME: Final[str] = "session_time"

# Ordered list of all feature names — **must** match build order in build_features.
_FEATURE_NAMES: Final[list[str]] = [
    # price_action (8)
    "ret_1",
    "ret_5",
    "ret_10",
    "log_return",
    "body_pct",
    "upper_wick_pct",
    "lower_wick_pct",
    "range_pct",
    # volatility (3)
    "rolling_vol_5",
    "rolling_vol_20",
    "atr",
    # volume (3)
    "rvol",
    "volume_zscore",
    "volume_delta",
    # volume_profile (4)
    "dist_poc",
    "dist_vah",
    "dist_val",
    "inside_value_area",
    # orderflow (4)
    "spread_norm",
    "mid_price",
    "queue_imbalance",
    "bid_ask_pressure",
    # footprint_cvd (4)
    "cvd_slope",
    "cvd_norm",
    "imbalance_count",
    "stacked_imbalance",
    # session_time (4)
    "hour_sin",
    "hour_cos",
    "day_sin",
    "day_cos",
]

_FEATURE_SCHEMA: Final[dict[str, dict]] = {
    # price_action
    "ret_1":             {"dtype": "float64", "family": _PRICE_ACTION},
    "ret_5":             {"dtype": "float64", "family": _PRICE_ACTION},
    "ret_10":            {"dtype": "float64", "family": _PRICE_ACTION},
    "log_return":        {"dtype": "float64", "family": _PRICE_ACTION},
    "body_pct":          {"dtype": "float64", "family": _PRICE_ACTION},
    "upper_wick_pct":    {"dtype": "float64", "family": _PRICE_ACTION},
    "lower_wick_pct":    {"dtype": "float64", "family": _PRICE_ACTION},
    "range_pct":         {"dtype": "float64", "family": _PRICE_ACTION},
    # volatility
    "rolling_vol_5":     {"dtype": "float64", "family": _VOLATILITY},
    "rolling_vol_20":    {"dtype": "float64", "family": _VOLATILITY},
    "atr":               {"dtype": "float64", "family": _VOLATILITY},
    # volume
    "rvol":              {"dtype": "float64", "family": _VOLUME},
    "volume_zscore":     {"dtype": "float64", "family": _VOLUME},
    "volume_delta":      {"dtype": "float64", "family": _VOLUME},
    # volume_profile
    "dist_poc":          {"dtype": "float64", "family": _VOLUME_PROFILE},
    "dist_vah":          {"dtype": "float64", "family": _VOLUME_PROFILE},
    "dist_val":          {"dtype": "float64", "family": _VOLUME_PROFILE},
    "inside_value_area": {"dtype": "float64", "family": _VOLUME_PROFILE},
    # orderflow
    "spread_norm":       {"dtype": "float64", "family": _ORDERFLOW},
    "mid_price":         {"dtype": "float64", "family": _ORDERFLOW},
    "queue_imbalance":   {"dtype": "float64", "family": _ORDERFLOW},
    "bid_ask_pressure":  {"dtype": "float64", "family": _ORDERFLOW},
    # footprint_cvd
    "cvd_slope":         {"dtype": "float64", "family": _FOOTPRINT_CVD},
    "cvd_norm":          {"dtype": "float64", "family": _FOOTPRINT_CVD},
    "imbalance_count":   {"dtype": "float64", "family": _FOOTPRINT_CVD},
    "stacked_imbalance": {"dtype": "float64", "family": _FOOTPRINT_CVD},
    # session_time
    "hour_sin":          {"dtype": "float64", "family": _SESSION_TIME},
    "hour_cos":          {"dtype": "float64", "family": _SESSION_TIME},
    "day_sin":           {"dtype": "float64", "family": _SESSION_TIME},
    "day_cos":           {"dtype": "float64", "family": _SESSION_TIME},
}

# Required raw columns in the input DataFrame.
_REQUIRED_COLUMNS: Final[list[str]] = [
    "open", "high", "low", "close", "volume",
    "vwap", "poc", "vah", "val",
    "spread", "bid_vol", "ask_vol",
    "cvd", "up_imbalance", "down_imbalance",
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_feature_names() -> list[str]:
    """Return the ordered list of all P1 feature names.

    The order matches the column order returned by :func:`build_features`.
    """
    return list(_FEATURE_NAMES)


def get_feature_schema() -> dict[str, dict]:
    """Return the feature schema as a dict.

    Schema format::

        {
            feature_name: {
                "dtype": "float64",
                "family": "price_action | volatility | volume | "
                          "volume_profile | orderflow | footprint_cvd | session_time"
            },
            ...
        }
    """
    return {k: dict(v) for k, v in _FEATURE_SCHEMA.items()}


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Build all P1 features as-of t. No lookahead.

    Parameters
    ----------
    df:
        Raw OHLCV + orderflow DataFrame.  Must contain the columns listed in
        ``_REQUIRED_COLUMNS``.  Index should be a ``DatetimeIndex`` so that
        session/time features are computable.

    Returns
    -------
    pd.DataFrame
        DataFrame containing *only* the feature columns defined in
        :func:`get_feature_names`, with any rows that still contain NaN
        after computation dropped.  Index is preserved (subset of input index).

    Notes
    -----
    Feature math (all at time t, no look-ahead):

    Price Action
    ~~~~~~~~~~~~
    ret_1          = log(close[t] / close[t-1])
    ret_5          = log(close[t] / close[t-5])
    ret_10         = log(close[t] / close[t-10])
    log_return     = ret_1  (alias for compatibility)
    body_pct       = (close - open) / (high - low + 1e-9)
    upper_wick_pct = (high - max(open, close)) / (high - low + 1e-9)
    lower_wick_pct = (min(open, close) - low) / (high - low + 1e-9)
    range_pct      = (high - low) / close

    Volatility
    ~~~~~~~~~~
    rolling_vol_5  = std(ret_1, window=5,  ddof=1)
    rolling_vol_20 = std(ret_1, window=20, ddof=1)
    atr            = mean over 14 bars of:
                       TR = max(high-low, |high-close[t-1]|, |low-close[t-1]|)
                     (Wilder's ATR approximated as simple rolling mean of TR)

    Volume
    ~~~~~~
    rvol           = volume[t] / rolling_mean(volume, 20)
    volume_zscore  = (volume - rolling_mean(volume,20)) /
                     (rolling_std(volume,20) + 1e-9)
    volume_delta   = (volume - volume[t-1]) / (volume[t-1] + 1e-9)

    Volume Profile
    ~~~~~~~~~~~~~~
    dist_poc           = (close - poc) / (close + 1e-9)
    dist_vah           = (close - vah) / (close + 1e-9)
    dist_val           = (close - val) / (close + 1e-9)
    inside_value_area  = 1 if val <= close <= vah else 0

    Orderflow
    ~~~~~~~~~
    spread_norm     = spread / close
    mid_price       = (bid_vol + ask_vol) / 2 / (close + 1e-9)
    queue_imbalance = (bid_vol - ask_vol) / (bid_vol + ask_vol + 1e-9)
    bid_ask_pressure= (bid_vol - ask_vol) / (volume + 1e-9)

    Footprint / CVD
    ~~~~~~~~~~~~~~~
    cvd_slope        = (cvd[t] - cvd[t-5]) / 5
    cvd_norm         = cvd / (rolling_sum(volume, 5) + 1e-9)
    imbalance_count  = up_imbalance - down_imbalance
    stacked_imbalance= rolling_sum(sign(imbalance_count), 3)

    Session / Time
    ~~~~~~~~~~~~~~
    hour_sin = sin(2π × hour / 24)
    hour_cos = cos(2π × hour / 24)
    day_sin  = sin(2π × dow  / 5)   # dow = day-of-week, 0=Monday
    day_cos  = cos(2π × dow  / 5)
    """
    _validate_columns(df)

    out = pd.DataFrame(index=df.index)

    close = df["close"]
    open_ = df["open"]
    high = df["high"]
    low = df["low"]
    volume = df["volume"]
    hl_range = high - low  # reused

    # ------------------------------------------------------------------
    # Price Action
    # ------------------------------------------------------------------

    # ret_1 = log(close[t] / close[t-1])
    out["ret_1"] = np.log(close / close.shift(1))

    # ret_5 = log(close[t] / close[t-5])
    out["ret_5"] = np.log(close / close.shift(5))

    # ret_10 = log(close[t] / close[t-10])
    out["ret_10"] = np.log(close / close.shift(10))

    # log_return is an alias for ret_1
    out["log_return"] = out["ret_1"]

    # body_pct = (close - open) / (high - low + ε)
    out["body_pct"] = (close - open_) / (hl_range + 1e-9)

    # upper_wick_pct = (high - max(open, close)) / (high - low + ε)
    out["upper_wick_pct"] = (high - np.maximum(open_, close)) / (hl_range + 1e-9)

    # lower_wick_pct = (min(open, close) - low) / (high - low + ε)
    out["lower_wick_pct"] = (np.minimum(open_, close) - low) / (hl_range + 1e-9)

    # range_pct = (high - low) / close
    out["range_pct"] = hl_range / close

    # ------------------------------------------------------------------
    # Volatility
    # ------------------------------------------------------------------

    # rolling_vol_5 = std(ret_1, window=5, ddof=1)
    out["rolling_vol_5"] = out["ret_1"].rolling(window=5, min_periods=5).std(ddof=1)

    # rolling_vol_20 = std(ret_1, window=20, ddof=1)
    out["rolling_vol_20"] = out["ret_1"].rolling(window=20, min_periods=20).std(ddof=1)

    # ATR (Wilder's, approximated as 14-bar simple rolling mean of True Range)
    # TR = max(high-low, |high - close[t-1]|, |low - close[t-1]|)
    prev_close = close.shift(1)
    tr = pd.concat(
        [
            hl_range,
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    out["atr"] = tr.rolling(window=14, min_periods=14).mean()

    # ------------------------------------------------------------------
    # Volume
    # ------------------------------------------------------------------

    vol_mean_20 = volume.rolling(window=20, min_periods=20).mean()
    vol_std_20 = volume.rolling(window=20, min_periods=20).std(ddof=1)

    # rvol = volume[t] / rolling_mean(volume, 20)
    out["rvol"] = volume / (vol_mean_20 + 1e-9)

    # volume_zscore = (volume - mean20) / (std20 + ε)
    out["volume_zscore"] = (volume - vol_mean_20) / (vol_std_20 + 1e-9)

    # volume_delta = (volume - volume[t-1]) / (volume[t-1] + ε)
    out["volume_delta"] = (volume - volume.shift(1)) / (volume.shift(1) + 1e-9)

    # ------------------------------------------------------------------
    # Volume Profile
    # ------------------------------------------------------------------

    poc = df["poc"]
    vah = df["vah"]
    val = df["val"]

    # dist_poc = (close - poc) / (close + ε)
    out["dist_poc"] = (close - poc) / (close + 1e-9)

    # dist_vah = (close - vah) / (close + ε)
    out["dist_vah"] = (close - vah) / (close + 1e-9)

    # dist_val = (close - val) / (close + ε)
    out["dist_val"] = (close - val) / (close + 1e-9)

    # inside_value_area = 1 if val <= close <= vah else 0
    out["inside_value_area"] = (
        ((close >= val) & (close <= vah)).astype("float64")
    )

    # ------------------------------------------------------------------
    # Orderflow
    # ------------------------------------------------------------------

    bid_vol = df["bid_vol"]
    ask_vol = df["ask_vol"]
    spread = df["spread"]

    # spread_norm = spread / close
    out["spread_norm"] = spread / close

    # mid_price = (bid_vol + ask_vol) / 2 / (close + ε)  [normalised mid]
    out["mid_price"] = (bid_vol + ask_vol) / 2.0 / (close + 1e-9)

    # queue_imbalance = (bid_vol - ask_vol) / (bid_vol + ask_vol + ε)
    out["queue_imbalance"] = (bid_vol - ask_vol) / (bid_vol + ask_vol + 1e-9)

    # bid_ask_pressure = (bid_vol - ask_vol) / (volume + ε)
    out["bid_ask_pressure"] = (bid_vol - ask_vol) / (volume + 1e-9)

    # ------------------------------------------------------------------
    # Footprint / CVD
    # ------------------------------------------------------------------

    cvd = df["cvd"]
    up_imb = df["up_imbalance"]
    dn_imb = df["down_imbalance"]

    # cvd_slope = (cvd[t] - cvd[t-5]) / 5
    out["cvd_slope"] = (cvd - cvd.shift(5)) / 5.0

    # cvd_norm = cvd / (rolling_sum(volume, 5) + ε)
    out["cvd_norm"] = cvd / (volume.rolling(window=5, min_periods=5).sum() + 1e-9)

    # imbalance_count = up_imbalance - down_imbalance
    imb_count = up_imb - dn_imb
    out["imbalance_count"] = imb_count.astype("float64")

    # stacked_imbalance = rolling_sum(sign(imbalance_count), 3)
    # sign: +1 if net bullish imbalance, -1 if net bearish, 0 if zero
    out["stacked_imbalance"] = (
        np.sign(imb_count).rolling(window=3, min_periods=3).sum()
    )

    # ------------------------------------------------------------------
    # Session / Time
    # ------------------------------------------------------------------

    try:
        hour = df.index.hour.astype("float64")
        dow = df.index.dayofweek.astype("float64")  # 0=Monday … 4=Friday
    except AttributeError as exc:
        raise TypeError(
            "DataFrame index must be a DatetimeIndex to compute session/time features."
        ) from exc

    # hour_sin/cos encode the 24-hour clock cyclically
    out["hour_sin"] = np.sin(2.0 * np.pi * hour / 24.0)
    out["hour_cos"] = np.cos(2.0 * np.pi * hour / 24.0)

    # day_sin/cos encode the 5-day trading week cyclically
    out["day_sin"] = np.sin(2.0 * np.pi * dow / 5.0)
    out["day_cos"] = np.cos(2.0 * np.pi * dow / 5.0)

    # ------------------------------------------------------------------
    # Finalise — keep only declared feature columns, drop NaN rows
    # ------------------------------------------------------------------

    out = out[_FEATURE_NAMES]
    n_before = len(out)
    out = out.dropna()
    n_dropped = n_before - len(out)

    if n_dropped > 0:
        logger.debug("build_features: dropped %d NaN rows (warm-up period).", n_dropped)

    return out


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _validate_columns(df: pd.DataFrame) -> None:
    """Raise ValueError if any required input column is missing."""
    missing = [c for c in _REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(
            f"Input DataFrame is missing required columns: {missing}. "
            f"Expected: {_REQUIRED_COLUMNS}"
        )
