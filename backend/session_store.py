import json
import os
import sqlite3
import threading
import time


def _now_ms() -> int:
    return int(time.time() * 1000)


class SessionStateStore:
    """Persist per-device session state in SQLite."""

    def __init__(self, db_path: str):
        self.db_path = db_path
        self._lock = threading.Lock()
        self._ensure_parent_dir()
        self._init_db()

    def _ensure_parent_dir(self):
        if self.db_path in (":memory:", ""):
            return

        if self.db_path.startswith("file:"):
            return

        parent = os.path.dirname(self.db_path)
        if parent:
            os.makedirs(parent, exist_ok=True)

    def _connect(self):
        use_uri = self.db_path.startswith("file:")
        conn = sqlite3.connect(self.db_path, check_same_thread=False, uri=use_uri)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS device_session_state (
                        device_id TEXT PRIMARY KEY,
                        payload_json TEXT NOT NULL,
                        created_at INTEGER NOT NULL,
                        updated_at INTEGER NOT NULL
                    )
                    """
                )
                conn.commit()
            finally:
                conn.close()

    def get_state(self, device_id: str):
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT payload_json, updated_at FROM device_session_state WHERE device_id = ?",
                    (device_id,),
                ).fetchone()
            finally:
                conn.close()

        if not row:
            return None

        return {
            "state": json.loads(row["payload_json"]),
            "updated_at": row["updated_at"],
        }

    def save_state(self, device_id: str, state: dict):
        payload_json = json.dumps(state, ensure_ascii=True)
        now = _now_ms()

        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO device_session_state (device_id, payload_json, created_at, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(device_id) DO UPDATE SET
                        payload_json=excluded.payload_json,
                        updated_at=excluded.updated_at
                    """,
                    (device_id, payload_json, now, now),
                )
                conn.commit()
            finally:
                conn.close()

        return now


def create_session_store(db_path: str) -> SessionStateStore:
    return SessionStateStore(db_path=db_path)