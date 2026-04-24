import os
import sqlite3
import threading
import time
from typing import Optional

from werkzeug.security import check_password_hash, generate_password_hash


def _now_ms() -> int:
    return int(time.time() * 1000)


class AuthStore:
    """Persist users and auth sessions in SQLite."""

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
        conn = sqlite3.connect(self.db_path, check_same_thread=False, uri=use_uri, timeout=5.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    def _init_db(self):
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        email TEXT NOT NULL UNIQUE,
                        password_hash TEXT NOT NULL,
                        created_at INTEGER NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS auth_sessions (
                        session_id TEXT PRIMARY KEY,
                        user_id INTEGER NOT NULL,
                        created_at INTEGER NOT NULL,
                        expires_at INTEGER NOT NULL,
                        FOREIGN KEY (user_id) REFERENCES users(id)
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS device_user_bindings (
                        device_id TEXT PRIMARY KEY,
                        user_id INTEGER NOT NULL,
                        linked_at INTEGER NOT NULL,
                        FOREIGN KEY (user_id) REFERENCES users(id)
                    )
                    """
                )
                conn.commit()
            finally:
                conn.close()

    def create_user(self, email: str, password: str):
        now = _now_ms()
        password_hash = generate_password_hash(password)

        with self._lock:
            conn = self._connect()
            try:
                cursor = conn.execute(
                    "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
                    (email, password_hash, now),
                )
                user_id = cursor.lastrowid
                conn.commit()
            finally:
                conn.close()

        return {"id": user_id, "email": email, "created_at": now}

    def get_user_by_email(self, email: str):
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT id, email, password_hash, created_at FROM users WHERE email = ?",
                    (email,),
                ).fetchone()
            finally:
                conn.close()

        if not row:
            return None

        return {
            "id": row["id"],
            "email": row["email"],
            "password_hash": row["password_hash"],
            "created_at": row["created_at"],
        }

    def verify_user_credentials(self, email: str, password: str):
        user = self.get_user_by_email(email)
        if not user:
            return None
        if not check_password_hash(user["password_hash"], password):
            return None
        return {"id": user["id"], "email": user["email"], "created_at": user["created_at"]}

    def create_auth_session(self, session_id: str, user_id: int, ttl_seconds: int):
        now = _now_ms()
        expires_at = now + (ttl_seconds * 1000)

        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    "INSERT INTO auth_sessions (session_id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                    (session_id, user_id, now, expires_at),
                )
                conn.commit()
            finally:
                conn.close()

        return {"session_id": session_id, "user_id": user_id, "expires_at": expires_at}

    def get_user_by_session(self, session_id: str):
        now = _now_ms()

        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT u.id AS user_id, u.email AS email, s.expires_at AS expires_at
                    FROM auth_sessions s
                    JOIN users u ON u.id = s.user_id
                    WHERE s.session_id = ?
                    """,
                    (session_id,),
                ).fetchone()
                if row and row["expires_at"] <= now:
                    conn.execute("DELETE FROM auth_sessions WHERE session_id = ?", (session_id,))
                    conn.commit()
                    row = None
            finally:
                conn.close()

        if not row:
            return None

        return {"id": row["user_id"], "email": row["email"], "expires_at": row["expires_at"]}

    def delete_session(self, session_id: str):
        with self._lock:
            conn = self._connect()
            try:
                conn.execute("DELETE FROM auth_sessions WHERE session_id = ?", (session_id,))
                conn.commit()
            finally:
                conn.close()

    def bind_device_to_user(self, device_id: str, user_id: int):
        now = _now_ms()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO device_user_bindings (device_id, user_id, linked_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(device_id) DO UPDATE SET
                        user_id=excluded.user_id,
                        linked_at=excluded.linked_at
                    """,
                    (device_id, user_id, now),
                )
                conn.commit()
            finally:
                conn.close()

    def verify_user_password(self, user_id: int, password: str) -> bool:
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT password_hash FROM users WHERE id = ?",
                    (user_id,),
                ).fetchone()
            finally:
                conn.close()

        if not row:
            return False

        return check_password_hash(row["password_hash"], password)

    def delete_user_account(self, user_id: int):
        with self._lock:
            conn = self._connect()
            try:
                conn.execute("DELETE FROM auth_sessions WHERE user_id = ?", (user_id,))
                conn.execute("DELETE FROM device_user_bindings WHERE user_id = ?", (user_id,))
                conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
                conn.commit()
            finally:
                conn.close()


def create_auth_store(db_path: str) -> AuthStore:
    return AuthStore(db_path=db_path)