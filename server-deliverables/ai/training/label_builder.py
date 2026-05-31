"""
label_builder.py — Tradable multi-class label construction for the ML pipeline.

Label definition (``tradable_v1``):
------------------------------------
entry_price = open[t+1]            — next bar open (tradable, no lookahead at entry)
exit_price  = close[t+H]           — close H bars after the entry bar

cost        = (COST_BPS + SLIPPAGE_BPS * 2) / 10_000
              (round-trip commission + slippage on both sides)

r_net       = (exit_price - entry_price) / entry_price - cost
              (net return after friction, expressed as a decimal fraction)

Class assignment:
  LONG    (2): r_net  >  +TAU
  NEUTRAL (1): -TAU  <=  r_net  <=  +TAU
  SHORT   (0): r_net  <  -TAU

The last H rows of the input cannot be labelled (no forward data) and are
therefore dropped from the returned Series.

Parameters (imported from config.py):
    HORIZON       = 5      forward bars for exit
    TAU           = 0.001  label threshold (net return, decimal)
    COST_BPS      = 8      round-trip broker commission in basis points
    SLIPPAGE_BPS  = 2      slippage per side in basis points
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from server_deliverables.ai.config import (
    CLASS_MAPPING,
    COST_BPS,
    HORIZON,
    IDX_TO_CLASS,
    SLIPPAGE_BPS,
    TAU,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def label_multiclass(
    df: pd.DataFrame,
    horizon: int = HORIZON,
    tau: float = TAU,
) -> pd.Series:
    """Build the 3-class ``tradable_v1`` label.

    Parameters
    ----------
    df:
        OHLCV DataFrame.  Must contain at least ``open`` and ``close`` columns.
        Index should be ordered chronologically.
    horizon:
        Number of forward bars used for the exit price.  Defaults to
        :data:`config.HORIZON`.
    tau:
        Minimum net return magnitude to be classified as LONG or SHORT.
        Defaults to :data:`config.TAU`.

    Returns
    -------
    pd.Series[int]
        Integer class labels aligned to the **same index** as ``df``, with
        the last *horizon* rows removed (they lack forward data).  Values are
        one of ``{0: SHORT, 1: NEUTRAL, 2: LONG}``.

    Notes
    -----
    No lookahead at or before t:

    * ``entry_price = open[t+1]``  — uses ``shift(-1)`` on ``open``
    * ``exit_price  = close[t+H]`` — uses ``shift(-horizon)`` on ``close``

    Both shift operations produce NaN for the final rows, which are then
    dropped via ``dropna()``.

    Cost model::

        total_cost = (COST_BPS + SLIPPAGE_BPS * 2) / 10_000

    Net return::

        r_net = (exit_price - entry_price) / entry_price - total_cost
    """
    if "open" not in df.columns or "close" not in df.columns:
        raise ValueError("DataFrame must contain 'open' and 'close' columns.")

    # Total round-trip friction as a decimal fraction.
    # COST_BPS is round-trip; SLIPPAGE_BPS is per-side so multiply by 2.
    total_cost: float = (COST_BPS + SLIPPAGE_BPS * 2) / 10_000.0

    # entry_price: next bar open — shift open backwards by 1 (no lookahead at t)
    entry_price: pd.Series = df["open"].shift(-1)

    # exit_price: close H bars after the entry bar.
    # shift(-horizon) on close gives close[t+H] aligned at row t.
    exit_price: pd.Series = df["close"].shift(-horizon)

    # Align into a temporary frame and drop rows where either is NaN
    # (i.e. the last 'horizon' rows of the dataset).
    tmp = pd.DataFrame(
        {"entry": entry_price, "exit": exit_price},
        index=df.index,
    ).dropna()

    # Net return after friction
    r_net: pd.Series = (tmp["exit"] - tmp["entry"]) / tmp["entry"] - total_cost

    # Vectorised 3-class assignment
    labels = pd.Series(
        CLASS_MAPPING["NEUTRAL"],  # default → NEUTRAL
        index=tmp.index,
        dtype="int64",
        name="label",
    )
    labels[r_net > tau] = CLASS_MAPPING["LONG"]
    labels[r_net < -tau] = CLASS_MAPPING["SHORT"]

    n_dropped = len(df) - len(labels)
    logger.debug(
        "label_multiclass: %d total rows → %d labelled (dropped %d tail rows, horizon=%d).",
        len(df),
        len(labels),
        n_dropped,
        horizon,
    )

    return labels


def label_stats(y: pd.Series) -> dict:
    """Return class distribution statistics for a label Series.

    Parameters
    ----------
    y:
        Integer label Series (values 0, 1, 2).

    Returns
    -------
    dict
        Structure::

            {
                "counts":      {"SHORT": int, "NEUTRAL": int, "LONG": int},
                "percentages": {"SHORT": float, "NEUTRAL": float, "LONG": float},
                "total":       int,
            }

        Counts and percentages are keyed by human-readable class names.
    """
    total = len(y)
    counts: dict[str, int] = {}
    percentages: dict[str, float] = {}

    for idx, name in IDX_TO_CLASS.items():
        n = int((y == idx).sum())
        counts[name] = n
        percentages[name] = round(n / total * 100.0, 4) if total > 0 else 0.0

    return {
        "counts": counts,
        "percentages": percentages,
        "total": total,
    }
