"""
model_registry.py — SQLite-backed model registry.

Tracks model versions (candidate → champion → old lifecycle), dataset snapshots,
and associated metadata/metrics for the ML Signal Engine.

Schema
------
MODEL_VERSION  — one row per trained artefact
DATASET_VERSION — one row per unique dataset snapshot (keyed by hash)
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from typing import Any

# ---------------------------------------------------------------------------
# Config fallbacks
# ---------------------------------------------------------------------------
try:
    from config import REGISTRY_DB  # noqa: F401
except ImportError:
    REGISTRY_DB: str = "server-deliverables/ai/registry/registry.db"

# ---------------------------------------------------------------------------
# DDL
# ---------------------------------------------------------------------------

_DDL_MODEL_VERSION = """
CREATE TABLE IF NOT EXISTS MODEL_VERSION (
    model_id                INTEGER PRIMARY KEY AUTOINCREMENT,
    version                 TEXT    UNIQUE NOT NULL,
    status                  TEXT    NOT NULL DEFAULT 'candidate',
    symbol                  TEXT,
    timeframe               TEXT,
    dataset_hash            TEXT,
    feature_schema_hash     TEXT,
    git_sha                 TEXT,
    training_window_start   TEXT,
    training_window_end     TEXT,
    horizon                 INTEGER,
    metrics_json            TEXT,
    artifact_uri            TEXT,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    promoted_at             TIMESTAMP
);
"""

_DDL_DATASET_VERSION = """
CREATE TABLE IF NOT EXISTS DATASET_VERSION (
    dataset_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    dataset_hash        TEXT    UNIQUE NOT NULL,
    symbol              TEXT,
    timeframe           TEXT,
    window_start        TEXT,
    window_end          TEXT,
    n_samples           INTEGER,
    feature_schema_hash TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _row_to_dict(cursor: sqlite3.Cursor, row: tuple) -> dict:
    """Convert a sqlite3 row tuple to a plain dict using cursor column names."""
    cols = [desc[0] for desc in cursor.description]
    return dict(zip(cols, row))


def _now_iso() -> str:
    """Return current UTC timestamp as ISO-8601 string."""
    return datetime.now(tz=timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# ModelRegistry
# ---------------------------------------------------------------------------

class ModelRegistry:
    """
    SQLite-backed registry for ML model versions and dataset snapshots.

    Parameters
    ----------
    db_path:
        Path to the SQLite database file.  Will be created if it does not
        exist.  Defaults to ``REGISTRY_DB`` from config.
    """

    def __init__(self, db_path: str = REGISTRY_DB) -> None:
        self._db_path = db_path
        self._conn: sqlite3.Connection = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL;")
        self._conn.execute("PRAGMA foreign_keys=ON;")
        self._migrate()

    # ------------------------------------------------------------------
    # Schema migration
    # ------------------------------------------------------------------

    def _migrate(self) -> None:
        """Create tables if they do not already exist."""
        with self._conn:
            self._conn.execute(_DDL_MODEL_VERSION)
            self._conn.execute(_DDL_DATASET_VERSION)

    # ------------------------------------------------------------------
    # Model version operations
    # ------------------------------------------------------------------

    def register_model(
        self,
        version: str,
        *,
        artifact_uri: str,
        metrics: dict,
        symbol: str = "",
        timeframe: str = "",
        dataset_hash: str = "",
        feature_schema_hash: str = "",
        git_sha: str = "",
        training_window_start: str = "",
        training_window_end: str = "",
        horizon: int = 5,
    ) -> int:
        """
        Insert a new model record with status ``'candidate'``.

        Parameters
        ----------
        version:
            Unique version identifier (e.g. ``"v1.2.3"`` or a SHA prefix).
        artifact_uri:
            Filesystem or object-storage path to the serialised model file.
        metrics:
            Dict of evaluation metrics (e.g. ``{"accuracy": 0.62, "f1": 0.58}``).
            Stored as JSON text.
        symbol, timeframe, dataset_hash, feature_schema_hash, git_sha,
        training_window_start, training_window_end, horizon:
            Optional metadata attached to the artefact.

        Returns
        -------
        int
            Auto-incremented ``model_id`` of the newly created row.

        Raises
        ------
        sqlite3.IntegrityError
            If *version* already exists in the registry.
        """
        metrics_json = json.dumps(metrics)
        sql = """
            INSERT INTO MODEL_VERSION (
                version, status, symbol, timeframe, dataset_hash,
                feature_schema_hash, git_sha, training_window_start,
                training_window_end, horizon, metrics_json, artifact_uri,
                created_at
            ) VALUES (?, 'candidate', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        with self._conn:
            cur = self._conn.execute(
                sql,
                (
                    version,
                    symbol,
                    timeframe,
                    dataset_hash,
                    feature_schema_hash,
                    git_sha,
                    training_window_start,
                    training_window_end,
                    horizon,
                    metrics_json,
                    artifact_uri,
                    _now_iso(),
                ),
            )
            return cur.lastrowid  # type: ignore[return-value]

    def promote_champion(self, version: str) -> None:
        """
        Promote *version* to ``'champion'`` status.

        The previous champion (if any) for the same symbol is demoted to
        ``'old'``.  If *version* is not found, ``ValueError`` is raised.

        Parameters
        ----------
        version:
            Version string of the model to promote.
        """
        row = self.get_model(version)
        if row is None:
            raise ValueError(f"Model version '{version}' not found in registry.")

        symbol = row.get("symbol", "") or ""
        now = _now_iso()

        with self._conn:
            # Demote any existing champion for this symbol.
            if symbol:
                self._conn.execute(
                    "UPDATE MODEL_VERSION SET status='old' WHERE status='champion' AND symbol=?",
                    (symbol,),
                )
            else:
                self._conn.execute(
                    "UPDATE MODEL_VERSION SET status='old' WHERE status='champion' AND (symbol IS NULL OR symbol='')",
                )
            # Promote the target version.
            self._conn.execute(
                "UPDATE MODEL_VERSION SET status='champion', promoted_at=? WHERE version=?",
                (now, version),
            )

    def get_champion(self, symbol: str = "") -> dict | None:
        """
        Return the current champion model row, or ``None`` if no champion exists.

        Parameters
        ----------
        symbol:
            Filter by symbol.  Pass an empty string to match rows where
            symbol is empty / NULL.
        """
        if symbol:
            sql = "SELECT * FROM MODEL_VERSION WHERE status='champion' AND symbol=? ORDER BY promoted_at DESC LIMIT 1"
            params: tuple[Any, ...] = (symbol,)
        else:
            sql = "SELECT * FROM MODEL_VERSION WHERE status='champion' AND (symbol IS NULL OR symbol='') ORDER BY promoted_at DESC LIMIT 1"
            params = ()

        cur = self._conn.execute(sql, params)
        row = cur.fetchone()
        if row is None:
            return None
        return dict(row)

    def get_challenger(self, symbol: str = "") -> dict | None:
        """
        Return the most recent candidate (non-champion) model row, or ``None``.

        Parameters
        ----------
        symbol:
            Filter by symbol.  Empty string matches rows with no symbol.
        """
        if symbol:
            sql = """SELECT * FROM MODEL_VERSION
                     WHERE status='candidate' AND symbol=?
                     ORDER BY created_at DESC LIMIT 1"""
            params: tuple[Any, ...] = (symbol,)
        else:
            sql = """SELECT * FROM MODEL_VERSION
                     WHERE status='candidate' AND (symbol IS NULL OR symbol='')
                     ORDER BY created_at DESC LIMIT 1"""
            params = ()

        cur = self._conn.execute(sql, params)
        row = cur.fetchone()
        if row is None:
            return None
        return dict(row)

    def list_models(self, symbol: str = "", limit: int = 50) -> list[dict]:
        """
        Return model rows ordered by ``created_at`` descending.

        Parameters
        ----------
        symbol:
            Optional symbol filter.  Empty string returns all symbols.
        limit:
            Maximum number of rows to return.
        """
        if symbol:
            sql = "SELECT * FROM MODEL_VERSION WHERE symbol=? ORDER BY created_at DESC LIMIT ?"
            params: tuple[Any, ...] = (symbol, limit)
        else:
            sql = "SELECT * FROM MODEL_VERSION ORDER BY created_at DESC LIMIT ?"
            params = (limit,)

        cur = self._conn.execute(sql, params)
        return [dict(row) for row in cur.fetchall()]

    def get_model(self, version: str) -> dict | None:
        """
        Return the model row for *version*, or ``None`` if not found.
        """
        cur = self._conn.execute(
            "SELECT * FROM MODEL_VERSION WHERE version=? LIMIT 1", (version,)
        )
        row = cur.fetchone()
        if row is None:
            return None
        return dict(row)

    # ------------------------------------------------------------------
    # Dataset version operations
    # ------------------------------------------------------------------

    def register_dataset(
        self,
        dataset_hash: str,
        *,
        symbol: str = "",
        timeframe: str = "",
        window_start: str = "",
        window_end: str = "",
        n_samples: int = 0,
        feature_schema_hash: str = "",
    ) -> None:
        """
        Insert or ignore a dataset snapshot record (upsert by ``dataset_hash``).

        Parameters
        ----------
        dataset_hash:
            Content hash (e.g. SHA-256 hex) that uniquely identifies the
            dataset.
        symbol, timeframe, window_start, window_end, n_samples,
        feature_schema_hash:
            Metadata about the dataset.
        """
        sql = """
            INSERT OR IGNORE INTO DATASET_VERSION (
                dataset_hash, symbol, timeframe, window_start, window_end,
                n_samples, feature_schema_hash, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """
        with self._conn:
            self._conn.execute(
                sql,
                (
                    dataset_hash,
                    symbol,
                    timeframe,
                    window_start,
                    window_end,
                    n_samples,
                    feature_schema_hash,
                    _now_iso(),
                ),
            )

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    def get_stats(self) -> dict:
        """
        Return a summary of registry contents.

        Returns
        -------
        dict
            ``{"total_models": int, "champion_version": str | None, "candidate_count": int}``
        """
        total_row = self._conn.execute("SELECT COUNT(*) FROM MODEL_VERSION").fetchone()
        total_models: int = total_row[0] if total_row else 0

        champ_row = self._conn.execute(
            "SELECT version FROM MODEL_VERSION WHERE status='champion' ORDER BY promoted_at DESC LIMIT 1"
        ).fetchone()
        champion_version: str | None = champ_row[0] if champ_row else None

        cand_row = self._conn.execute(
            "SELECT COUNT(*) FROM MODEL_VERSION WHERE status='candidate'"
        ).fetchone()
        candidate_count: int = cand_row[0] if cand_row else 0

        return {
            "total_models": total_models,
            "champion_version": champion_version,
            "candidate_count": candidate_count,
        }

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def close(self) -> None:
        """Close the underlying SQLite connection."""
        self._conn.close()

    def __enter__(self) -> "ModelRegistry":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()
