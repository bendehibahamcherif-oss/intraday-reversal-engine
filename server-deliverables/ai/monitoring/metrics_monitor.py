"""
metrics_monitor.py — Prometheus metrics for ML inference monitoring.

Exports (when prometheus_client is available):
  ml_infer_latency_seconds (Histogram) — per-request inference latency
  ml_infer_requests_total  (Counter)   — total requests, labelled by status/signal
  ml_infer_errors_total    (Counter)   — total error events
  ml_model_confidence      (Gauge)     — last prediction confidence score
  ml_psi_score             (Gauge)     — PSI per feature (label: feature)

When prometheus_client is NOT installed the class falls back to a thread-safe
in-memory accumulator that tracks the same information and exposes it via
``get_snapshot()``.
"""

from __future__ import annotations

import threading
from typing import Dict, Optional

# ---------------------------------------------------------------------------
# Optional prometheus_client import
# ---------------------------------------------------------------------------
try:
    from prometheus_client import (
        CollectorRegistry,
        Counter,
        Gauge,
        Histogram,
        generate_latest,
    )

    PROMETHEUS_AVAILABLE = True
except ImportError:
    PROMETHEUS_AVAILABLE = False

# ---------------------------------------------------------------------------
# Config fallbacks (unused at runtime but kept for consistency)
# ---------------------------------------------------------------------------
try:
    from config import INFER_TIMEOUT_MS  # noqa: F401
except ImportError:
    INFER_TIMEOUT_MS: int = 400


# ---------------------------------------------------------------------------
# Prometheus metric definitions (created once per process)
# ---------------------------------------------------------------------------

_REGISTRY: Optional["CollectorRegistry"] = None  # type: ignore[name-defined]
_LATENCY_HISTOGRAM: Optional[object] = None
_REQUESTS_COUNTER: Optional[object] = None
_ERRORS_COUNTER: Optional[object] = None
_CONFIDENCE_GAUGE: Optional[object] = None
_PSI_GAUGE: Optional[object] = None
_PROM_INIT_LOCK = threading.Lock()


def _init_prometheus() -> None:
    """Initialise Prometheus metrics lazily (idempotent)."""
    global _REGISTRY, _LATENCY_HISTOGRAM, _REQUESTS_COUNTER
    global _ERRORS_COUNTER, _CONFIDENCE_GAUGE, _PSI_GAUGE

    if not PROMETHEUS_AVAILABLE:
        return
    if _REGISTRY is not None:
        return

    with _PROM_INIT_LOCK:
        if _REGISTRY is not None:
            return

        registry = CollectorRegistry()

        _LATENCY_HISTOGRAM = Histogram(
            "ml_infer_latency_seconds",
            "ML inference latency in seconds",
            buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0),
            registry=registry,
        )
        _REQUESTS_COUNTER = Counter(
            "ml_infer_requests_total",
            "Total ML inference requests",
            labelnames=["status", "signal"],
            registry=registry,
        )
        _ERRORS_COUNTER = Counter(
            "ml_infer_errors_total",
            "Total ML inference errors",
            registry=registry,
        )
        _CONFIDENCE_GAUGE = Gauge(
            "ml_model_confidence",
            "Last prediction confidence (max softmax probability)",
            registry=registry,
        )
        _PSI_GAUGE = Gauge(
            "ml_psi_score",
            "Population Stability Index per feature",
            labelnames=["feature"],
            registry=registry,
        )

        _REGISTRY = registry


# ---------------------------------------------------------------------------
# MLMetricsMonitor
# ---------------------------------------------------------------------------

class MLMetricsMonitor:
    """
    Thread-safe ML inference metrics collector.

    Supports both Prometheus export (when ``prometheus_client`` is installed)
    and a lightweight in-memory fallback.

    Example
    -------
    >>> monitor = MLMetricsMonitor()
    >>> monitor.record_inference(latency_s=0.003, signal="LONG", confidence=0.72)
    >>> snapshot = monitor.get_snapshot()
    """

    def __init__(self) -> None:
        _init_prometheus()

        # In-memory accumulator — always maintained regardless of Prometheus
        self._lock = threading.Lock()
        self._total_requests: int = 0
        self._error_count: int = 0
        self._latency_sum: float = 0.0
        self._latency_count: int = 0
        self._last_confidence: float = 0.0
        self._psi_by_feature: Dict[str, float] = {}
        # Granular counters by (status, signal)
        self._requests_by_label: Dict[str, int] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def record_inference(
        self,
        latency_s: float,
        signal: str,
        confidence: float,
        error: bool = False,
    ) -> None:
        """
        Record a single inference event.

        Parameters
        ----------
        latency_s:
            Wall-clock inference time in seconds.
        signal:
            Predicted class name (``"LONG"``, ``"SHORT"``, or ``"NEUTRAL"``).
        confidence:
            Max softmax probability for the predicted class.
        error:
            Set to ``True`` if the inference raised an exception.
        """
        status = "error" if error else "ok"

        # Update in-memory state
        with self._lock:
            self._total_requests += 1
            self._latency_sum += latency_s
            self._latency_count += 1
            self._last_confidence = confidence
            if error:
                self._error_count += 1
            label_key = f"{status}:{signal}"
            self._requests_by_label[label_key] = (
                self._requests_by_label.get(label_key, 0) + 1
            )

        # Update Prometheus metrics
        if PROMETHEUS_AVAILABLE and _REGISTRY is not None:
            try:
                _LATENCY_HISTOGRAM.observe(latency_s)  # type: ignore[union-attr]
                _REQUESTS_COUNTER.labels(status=status, signal=signal).inc()  # type: ignore[union-attr]
                _CONFIDENCE_GAUGE.set(confidence)  # type: ignore[union-attr]
                if error:
                    _ERRORS_COUNTER.inc()  # type: ignore[union-attr]
            except Exception:
                pass  # Never let metrics collection break inference

    def record_psi(self, feature: str, psi: float) -> None:
        """
        Update the PSI gauge for a named feature.

        Parameters
        ----------
        feature:
            Feature name used as the Prometheus label.
        psi:
            Current PSI score for that feature.
        """
        with self._lock:
            self._psi_by_feature[feature] = psi

        if PROMETHEUS_AVAILABLE and _REGISTRY is not None:
            try:
                _PSI_GAUGE.labels(feature=feature).set(psi)  # type: ignore[union-attr]
            except Exception:
                pass

    def get_snapshot(self) -> dict:
        """
        Return current metrics as a plain dict.

        This always works regardless of whether Prometheus is installed.

        Returns
        -------
        dict
            Structure::

                {
                    "total_requests":    int,
                    "error_count":       int,
                    "latency_sum_s":     float,
                    "latency_count":     int,
                    "avg_latency_s":     float,
                    "last_confidence":   float,
                    "psi_by_feature":    {feature: psi, ...},
                    "requests_by_label": {"ok:LONG": int, ...},
                    "prometheus_available": bool,
                }
        """
        with self._lock:
            avg_latency = (
                self._latency_sum / self._latency_count
                if self._latency_count > 0
                else 0.0
            )
            return {
                "total_requests": self._total_requests,
                "error_count": self._error_count,
                "latency_sum_s": round(self._latency_sum, 6),
                "latency_count": self._latency_count,
                "avg_latency_s": round(avg_latency, 6),
                "last_confidence": self._last_confidence,
                "psi_by_feature": dict(self._psi_by_feature),
                "requests_by_label": dict(self._requests_by_label),
                "prometheus_available": PROMETHEUS_AVAILABLE,
            }

    def export_prometheus(self) -> str | None:
        """
        Return Prometheus text-format metrics string.

        Returns ``None`` if ``prometheus_client`` is not installed.
        """
        if not PROMETHEUS_AVAILABLE or _REGISTRY is None:
            return None
        try:
            return generate_latest(_REGISTRY).decode("utf-8")
        except Exception:
            return None

    def reset(self) -> None:
        """
        Reset all in-memory counters to zero.

        Note: Prometheus counters are monotonically increasing and cannot be
        reset within the same process.
        """
        with self._lock:
            self._total_requests = 0
            self._error_count = 0
            self._latency_sum = 0.0
            self._latency_count = 0
            self._last_confidence = 0.0
            self._psi_by_feature = {}
            self._requests_by_label = {}
