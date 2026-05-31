"""
infer_worker.py — Persistent XGBoost inference worker with resource limits.

Protocol (newline-delimited JSON over stdin/stdout):

Startup:
  <- {"action": "load", "modelPath": "path/to/model.ubj", "modelVersion": "v1"}
  -> {"status": "ready", "modelPath": "...", "modelVersion": "...", "loadTimeMs": 123}

Predict:
  <- {"action": "predict", "features": [f1, f2, ...], "featureNames": ["ret_1", ...],
      "requestId": "uuid"}
  -> {"status": "ok", "requestId": "...", "signal": "LONG"|"NEUTRAL"|"SHORT",
      "probability": 0.84, "confidence": 0.80,
      "probabilities": {"SHORT": 0.10, "NEUTRAL": 0.25, "LONG": 0.65},
      "classIndex": 2, "modelVersion": "v1", "inferenceMs": 1.23}

Health:
  <- {"action": "health", "requestId": "uuid"}
  -> {"status": "ok", "modelLoaded": true, "modelVersion": "...", "requestId": "..."}

Shutdown:
  <- {"action": "shutdown"}
  -> (exit 0)
"""

import sys
import json
import time

import numpy as np
import xgboost as xgb

try:
    import resource  # Unix only
    RESOURCE_AVAILABLE = True
except ImportError:
    RESOURCE_AVAILABLE = False

# ---------------------------------------------------------------------------
# Config fallbacks
# ---------------------------------------------------------------------------
try:
    from config import CLASS_MAPPING, IDX_TO_CLASS  # noqa: F401
    CLASS_NAMES = list(IDX_TO_CLASS.values()) if IDX_TO_CLASS else ["SHORT", "NEUTRAL", "LONG"]
except ImportError:
    CLASS_MAPPING = {"SHORT": 0, "NEUTRAL": 1, "LONG": 2}
    IDX_TO_CLASS = {0: "SHORT", 1: "NEUTRAL", 2: "LONG"}
    CLASS_NAMES = ["SHORT", "NEUTRAL", "LONG"]

# ---------------------------------------------------------------------------
# Resource limits
# ---------------------------------------------------------------------------

def _set_resource_limits() -> None:
    """Apply OS-level resource limits for this process (Linux/macOS only)."""
    if not RESOURCE_AVAILABLE:
        return
    try:
        # Soft memory limit 150 MB; hard limit left unchanged (RLIM_INFINITY).
        soft_mem = 150 * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (soft_mem, resource.RLIM_INFINITY))
    except (ValueError, OSError):
        # Not always honoured inside containers; continue without limit.
        pass


def _set_cpu_time_limit(seconds: float = 0.5) -> None:
    """Apply a per-request CPU-time soft limit (best-effort)."""
    if not RESOURCE_AVAILABLE:
        return
    try:
        _, hard = resource.getrlimit(resource.RLIMIT_CPU)
        soft = max(1, int(seconds))  # RLIMIT_CPU is in whole seconds
        if hard != resource.RLIM_INFINITY and soft > hard:
            soft = hard
        resource.setrlimit(resource.RLIMIT_CPU, (soft, hard))
    except (ValueError, OSError):
        pass

# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def write_json(obj: dict) -> None:
    """Serialise *obj* to a single newline-terminated JSON line on stdout."""
    line = json.dumps(obj, separators=(",", ":"))
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


def read_json_line() -> dict | None:
    """Block until a full line is available on stdin; return parsed dict or None on EOF."""
    line = sys.stdin.readline()
    if not line:
        return None  # EOF
    line = line.strip()
    if not line:
        return {}
    return json.loads(line)

# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

def load_model(model_path: str) -> xgb.Booster:
    """Load an XGBoost booster from *model_path* (supports .ubj / .json / .model)."""
    booster = xgb.Booster()
    booster.load_model(model_path)
    return booster

# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------

def run_predict(
    booster: xgb.Booster,
    features: list,
    feature_names: list[str],
    request_id: str,
    model_version: str,
) -> dict:
    """
    Run inference on a single feature vector.

    Returns a response dict with:
      signal       — class name with highest probability
      probability  — max probability value
      confidence   — same as probability (alias)
      probabilities — {class_name: prob} mapping for all classes
      classIndex   — integer index of predicted class
      modelVersion — version string passed at load time
      inferenceMs  — wall-clock inference time in milliseconds
    """
    if len(features) != len(feature_names):
        return {
            "status": "error",
            "requestId": request_id,
            "error": (
                f"Feature length mismatch: got {len(features)} features "
                f"but {len(feature_names)} feature names"
            ),
        }

    t0 = time.perf_counter()

    # Build a single-row DMatrix with feature names for column ordering.
    arr = np.array(features, dtype=np.float32).reshape(1, -1)
    dmat = xgb.DMatrix(arr, feature_names=feature_names if feature_names else None)

    # Predict; XGBoost multi:softprob returns shape (1, n_classes).
    raw = booster.predict(dmat)
    probs = raw[0].tolist()  # list of length n_classes

    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    # Guard against mismatched num_class in the model.
    if len(probs) != len(CLASS_NAMES):
        # Pad or truncate to match CLASS_NAMES length.
        if len(probs) < len(CLASS_NAMES):
            probs += [0.0] * (len(CLASS_NAMES) - len(probs))
        else:
            probs = probs[: len(CLASS_NAMES)]

    class_idx = int(np.argmax(probs))
    max_prob = float(probs[class_idx])
    signal = IDX_TO_CLASS.get(class_idx, CLASS_NAMES[class_idx])
    prob_dict = {CLASS_NAMES[i]: float(probs[i]) for i in range(len(CLASS_NAMES))}

    return {
        "status": "ok",
        "requestId": request_id,
        "signal": signal,
        "probability": max_prob,
        "confidence": max_prob,
        "probabilities": prob_dict,
        "classIndex": class_idx,
        "modelVersion": model_version,
        "inferenceMs": round(elapsed_ms, 4),
    }

# ---------------------------------------------------------------------------
# Main event loop
# ---------------------------------------------------------------------------

def main() -> None:
    """Persistent worker: read JSON commands from stdin, write responses to stdout."""
    _set_resource_limits()

    booster: xgb.Booster | None = None
    current_model_version: str = ""
    current_model_path: str = ""

    while True:
        try:
            msg = read_json_line()
        except json.JSONDecodeError as exc:
            write_json({"status": "error", "error": f"JSON parse error: {exc}"})
            continue

        if msg is None:
            # stdin closed — clean shutdown.
            sys.exit(0)

        if not msg:
            # Empty line — ignore.
            continue

        action = msg.get("action", "")

        # ------------------------------------------------------------------ #
        # LOAD                                                                 #
        # ------------------------------------------------------------------ #
        if action == "load":
            model_path = msg.get("modelPath", "")
            model_version = msg.get("modelVersion", "unknown")
            t_load = time.perf_counter()
            try:
                booster = load_model(model_path)
                current_model_version = model_version
                current_model_path = model_path
                load_ms = round((time.perf_counter() - t_load) * 1000.0, 2)
                write_json(
                    {
                        "status": "ready",
                        "modelPath": model_path,
                        "modelVersion": model_version,
                        "loadTimeMs": load_ms,
                    }
                )
            except Exception as exc:
                write_json(
                    {
                        "status": "error",
                        "error": f"Failed to load model '{model_path}': {exc}",
                    }
                )

        # ------------------------------------------------------------------ #
        # PREDICT                                                              #
        # ------------------------------------------------------------------ #
        elif action == "predict":
            request_id = msg.get("requestId", "")
            if booster is None:
                write_json(
                    {
                        "status": "error",
                        "requestId": request_id,
                        "error": "Model not loaded. Send a 'load' action first.",
                    }
                )
                continue

            features = msg.get("features", [])
            feature_names = msg.get("featureNames", [])

            try:
                response = run_predict(
                    booster,
                    features,
                    feature_names,
                    request_id,
                    current_model_version,
                )
            except Exception as exc:
                response = {
                    "status": "error",
                    "requestId": request_id,
                    "error": f"Inference error: {exc}",
                }

            write_json(response)

        # ------------------------------------------------------------------ #
        # HEALTH                                                               #
        # ------------------------------------------------------------------ #
        elif action == "health":
            request_id = msg.get("requestId", "")
            write_json(
                {
                    "status": "ok",
                    "modelLoaded": booster is not None,
                    "modelVersion": current_model_version,
                    "modelPath": current_model_path,
                    "requestId": request_id,
                }
            )

        # ------------------------------------------------------------------ #
        # SHUTDOWN                                                             #
        # ------------------------------------------------------------------ #
        elif action == "shutdown":
            sys.exit(0)

        # ------------------------------------------------------------------ #
        # UNKNOWN                                                              #
        # ------------------------------------------------------------------ #
        else:
            write_json(
                {
                    "status": "error",
                    "error": f"Unknown action: '{action}'",
                }
            )


if __name__ == "__main__":
    main()
