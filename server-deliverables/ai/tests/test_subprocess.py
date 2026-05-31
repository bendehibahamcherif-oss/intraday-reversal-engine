"""
Integration-style tests for the stdin/stdout JSON IPC protocol.
Does not require a real ML model — uses a mock echo worker.
"""

from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Mock worker script — written to a temp file and executed as a subprocess
# ---------------------------------------------------------------------------

MOCK_WORKER_SCRIPT = '''
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        msg = json.loads(line)
    except json.JSONDecodeError:
        print(json.dumps({"status": "error", "error": "bad json"}), flush=True)
        continue
    action = msg.get("action", "")
    if action == "load":
        print(json.dumps({"status": "ready", "modelPath": msg.get("modelPath",""),
                          "modelVersion": msg.get("modelVersion",""), "loadTimeMs": 1}),
              flush=True)
    elif action == "predict":
        print(json.dumps({
            "status": "ok",
            "requestId": msg["requestId"],
            "signal": "LONG",
            "probability": 0.65,
            "confidence": 0.65,
            "classIndex": 2,
            "probabilities": {"SHORT": 0.10, "NEUTRAL": 0.25, "LONG": 0.65},
            "modelVersion": "mock",
        }), flush=True)
    elif action == "health":
        print(json.dumps({"status": "ok", "modelLoaded": True,
                          "requestId": msg.get("requestId","")}), flush=True)
    elif action == "shutdown":
        sys.exit(0)
    else:
        print(json.dumps({"status": "error",
                          "error": f"unknown action: {action}"}), flush=True)
'''


# ---------------------------------------------------------------------------
# Fixture: running mock worker process
# ---------------------------------------------------------------------------

@pytest.fixture()
def mock_worker_script(tmp_path):
    """Write the mock worker script to a temp file and return its path."""
    script = tmp_path / "mock_worker.py"
    script.write_text(MOCK_WORKER_SCRIPT, encoding="utf-8")
    return str(script)


@pytest.fixture()
def worker_process(mock_worker_script):
    """
    Spawn the mock worker as a subprocess with stdin/stdout pipes.
    Terminates the process after the test.
    """
    proc = subprocess.Popen(
        [sys.executable, mock_worker_script],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,  # line-buffered
    )
    yield proc
    if proc.poll() is None:
        try:
            proc.stdin.close()  # type: ignore[union-attr]
            proc.terminate()
            proc.wait(timeout=3)
        except Exception:
            proc.kill()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _send(proc: subprocess.Popen, obj: dict) -> None:
    """Write a JSON object as a newline-terminated line to the worker stdin."""
    line = json.dumps(obj) + "\n"
    proc.stdin.write(line)  # type: ignore[union-attr]
    proc.stdin.flush()  # type: ignore[union-attr]


def _recv(proc: subprocess.Popen, timeout: float = 5.0) -> dict:
    """Read one JSON line from the worker stdout with a deadline."""
    proc.stdout._stream if hasattr(proc.stdout, "_stream") else None  # type: ignore[union-attr]
    # Use readline directly (line-buffered stdout from worker)
    # We rely on the fact that the process flushes after every write.
    line = proc.stdout.readline()  # type: ignore[union-attr]
    if not line:
        raise EOFError("Worker closed stdout unexpectedly")
    return json.loads(line.strip())


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestMockWorkerStartup:
    def test_mock_worker_startup_handshake(self, worker_process):
        """
        Sending a 'load' action must result in a 'ready' status response.
        """
        _send(worker_process, {
            "action": "load",
            "modelPath": "/fake/model.ubj",
            "modelVersion": "v1",
        })
        resp = _recv(worker_process)
        assert resp["status"] == "ready", (
            f"Expected 'ready' status, got {resp!r}"
        )

    def test_mock_worker_predict_returns_signal(self, worker_process):
        """After load, a 'predict' action must return a response with 'signal' field."""
        _send(worker_process, {
            "action": "load",
            "modelPath": "/fake/model.ubj",
            "modelVersion": "v1",
        })
        _recv(worker_process)  # consume 'ready'

        req_id = str(uuid.uuid4())
        _send(worker_process, {
            "action": "predict",
            "requestId": req_id,
            "features": [0.1, -0.2, 0.3],
            "featureNames": ["a", "b", "c"],
        })
        resp = _recv(worker_process)
        assert "signal" in resp, f"'signal' not in response: {resp!r}"
        assert resp["signal"] in {"LONG", "SHORT", "NEUTRAL"}, (
            f"Invalid signal: {resp['signal']!r}"
        )

    def test_mock_worker_requestId_echoed(self, worker_process):
        """The requestId sent in the predict request must appear in the response."""
        _send(worker_process, {
            "action": "load",
            "modelPath": "/fake/model.ubj",
            "modelVersion": "v1",
        })
        _recv(worker_process)  # consume 'ready'

        unique_id = "test-id-" + str(uuid.uuid4())
        _send(worker_process, {
            "action": "predict",
            "requestId": unique_id,
            "features": [1.0],
            "featureNames": ["x"],
        })
        resp = _recv(worker_process)
        assert resp.get("requestId") == unique_id, (
            f"requestId not echoed: expected {unique_id!r}, got {resp.get('requestId')!r}"
        )


class TestMockWorkerShutdown:
    def test_mock_worker_shutdown_closes_process(self, mock_worker_script):
        """
        After sending 'shutdown', the worker process must exit with code 0.
        """
        proc = subprocess.Popen(
            [sys.executable, mock_worker_script],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        _send(proc, {"action": "shutdown"})
        try:
            exit_code = proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            pytest.fail("Worker did not exit within 5 seconds after shutdown")
        assert exit_code == 0, f"Expected exit code 0, got {exit_code}"


class TestProtocolDelimiter:
    def test_newline_delimiter_required(self, mock_worker_script):
        """
        A partial line sent without a terminating newline must not produce a
        response (the worker blocks waiting for the full line).
        This test sends a partial message and verifies no immediate response.
        """
        proc = subprocess.Popen(
            [sys.executable, mock_worker_script],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,  # unbuffered
        )
        try:
            # Send a partial JSON line (no trailing newline)
            partial = json.dumps({"action": "load", "modelPath": "/x", "modelVersion": "v1"})
            proc.stdin.write(partial.encode())  # type: ignore[union-attr]
            proc.stdin.flush()  # type: ignore[union-attr]

            # Non-blocking read: expect nothing back yet
            import select
            rlist, _, _ = select.select([proc.stdout], [], [], 0.3)
            assert rlist == [], (
                "Worker responded before receiving a complete newline-terminated line"
            )

            # Now complete the message with a newline
            proc.stdin.write(b"\n")  # type: ignore[union-attr]
            proc.stdin.flush()  # type: ignore[union-attr]

            # Now we should get a response
            rlist, _, _ = select.select([proc.stdout], [], [], 3.0)
            assert rlist, "Worker did not respond after receiving a complete line"
            line = proc.stdout.readline()  # type: ignore[union-attr]
            resp = json.loads(line.decode().strip())
            assert resp["status"] == "ready"
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait()


class TestMultiplePredictions:
    def test_multiple_sequential_predictions(self, worker_process):
        """
        Send 5 sequential predict requests; all must succeed with correct fields.
        """
        _send(worker_process, {
            "action": "load",
            "modelPath": "/fake/model.ubj",
            "modelVersion": "v1",
        })
        _recv(worker_process)  # consume 'ready'

        for i in range(5):
            req_id = f"seq-{i}"
            _send(worker_process, {
                "action": "predict",
                "requestId": req_id,
                "features": [float(i), float(i + 1)],
                "featureNames": ["x", "y"],
            })
            resp = _recv(worker_process)
            assert resp.get("status") == "ok", (
                f"Prediction {i} failed: {resp!r}"
            )
            assert resp.get("requestId") == req_id, (
                f"requestId mismatch on prediction {i}: {resp.get('requestId')!r}"
            )
            assert "signal" in resp, f"'signal' missing from prediction {i}: {resp!r}"
            assert "probability" in resp
            assert "probabilities" in resp
