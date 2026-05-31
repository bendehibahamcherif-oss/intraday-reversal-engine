#!/usr/bin/env python3
"""
infer_worker.py — Persistent XGBoost inference worker.

Protocol (newline-delimited JSON over stdin/stdout):

  Startup handshake (first message):
    IN:  {"action": "load", "modelPath": "..."}
    OUT: {"status": "ready", "modelPath": "..."}

  Predict:
    IN:  {"action": "predict", "features": [...], "featureNames": [...], "requestId": "..."}
    OUT: {"status": "ok", "requestId": "...", "class": "LONG"|"NEUTRAL"|"SHORT",
          "classIndex": 0|1|2, "probabilities": {"SHORT": 0.xx, "NEUTRAL": 0.xx, "LONG": 0.xx},
          "confidence": <max_prob>, "inferenceMs": <elapsed_ms>}

  Health:
    IN:  {"action": "health", "requestId": "..."}
    OUT: {"status": "ok", "modelLoaded": true|false, "requestId": "..."}

  Shutdown:
    IN:  {"action": "shutdown"}
    OUT: (process exits cleanly)

Class mapping (labelSpecVersion: tradable_v1):
  SHORT   = 0
  NEUTRAL = 1
  LONG    = 2
"""

import json
import sys
import time

import numpy as np
import xgboost as xgb

CLASS_NAMES = ["SHORT", "NEUTRAL", "LONG"]  # index -> class name


def write_json(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def read_json_line() -> dict:
    line = sys.stdin.readline()
    if not line:
        # stdin closed — shut down gracefully
        sys.exit(0)
    return json.loads(line.strip())


def load_model(model_path: str) -> xgb.Booster:
    booster = xgb.Booster()
    booster.load_model(model_path)
    return booster


def run_predict(
    booster: xgb.Booster,
    features: list,
    feature_names: list,
    request_id: str,
) -> dict:
    t_start = time.perf_counter()

    X = np.array([features], dtype=np.float32)
    dmat = xgb.DMatrix(X, feature_names=feature_names)

    raw = booster.predict(dmat)
    proba = raw.reshape(-1, 3)[0]  # shape (3,)

    class_index = int(np.argmax(proba))
    class_name = CLASS_NAMES[class_index]
    confidence = float(proba[class_index])

    elapsed_ms = (time.perf_counter() - t_start) * 1000.0

    return {
        "status": "ok",
        "requestId": request_id,
        "class": class_name,
        "classIndex": class_index,
        "probabilities": {
            "SHORT": float(proba[0]),
            "NEUTRAL": float(proba[1]),
            "LONG": float(proba[2]),
        },
        "confidence": confidence,
        "inferenceMs": round(elapsed_ms, 4),
    }


def main() -> None:
    booster: xgb.Booster | None = None
    model_path_loaded: str = ""

    # --- Startup handshake ---
    try:
        init_msg = read_json_line()
    except json.JSONDecodeError as exc:
        write_json({"status": "error", "requestId": "", "message": f"Invalid init JSON: {exc}"})
        sys.exit(1)

    if init_msg.get("action") != "load":
        write_json(
            {
                "status": "error",
                "requestId": "",
                "message": f"Expected action='load' as first message, got: {init_msg.get('action')}",
            }
        )
        sys.exit(1)

    model_path_loaded = init_msg.get("modelPath", "")
    try:
        booster = load_model(model_path_loaded)
        write_json({"status": "ready", "modelPath": model_path_loaded})
    except Exception as exc:  # pylint: disable=broad-except
        write_json(
            {
                "status": "error",
                "requestId": "",
                "message": f"Failed to load model '{model_path_loaded}': {exc}",
            }
        )
        sys.exit(1)

    # --- Main loop ---
    while True:
        try:
            msg = read_json_line()
        except json.JSONDecodeError as exc:
            write_json({"status": "error", "requestId": "", "message": f"Invalid JSON: {exc}"})
            continue

        action = msg.get("action", "")
        request_id = msg.get("requestId", "")

        if action == "predict":
            features = msg.get("features")
            feature_names = msg.get("featureNames")

            if features is None or feature_names is None:
                write_json(
                    {
                        "status": "error",
                        "requestId": request_id,
                        "message": "Missing 'features' or 'featureNames' in predict request.",
                    }
                )
                continue

            if len(features) != len(feature_names):
                write_json(
                    {
                        "status": "error",
                        "requestId": request_id,
                        "message": (
                            f"Length mismatch: features={len(features)}, "
                            f"featureNames={len(feature_names)}"
                        ),
                    }
                )
                continue

            if booster is None:
                write_json(
                    {
                        "status": "error",
                        "requestId": request_id,
                        "message": "Model not loaded.",
                    }
                )
                continue

            try:
                result = run_predict(booster, features, feature_names, request_id)
                write_json(result)
            except Exception as exc:  # pylint: disable=broad-except
                write_json(
                    {
                        "status": "error",
                        "requestId": request_id,
                        "message": f"Prediction failed: {exc}",
                    }
                )

        elif action == "health":
            write_json(
                {
                    "status": "ok",
                    "modelLoaded": booster is not None,
                    "requestId": request_id,
                }
            )

        elif action == "shutdown":
            sys.exit(0)

        else:
            write_json(
                {
                    "status": "error",
                    "requestId": request_id,
                    "message": f"Unknown action: '{action}'",
                }
            )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
