import argparse
import os
import sqlite3
import sys
from pathlib import Path
from typing import Dict, Optional

DEFAULT_DB_PATH = "data/streamnote.db"
TARGET_TABLES = [
    "device_session_state",
    "auth_sessions",
    "device_user_bindings",
    "users",
]


def resolve_db_path(cli_db_path: Optional[str]) -> Path:
    if cli_db_path:
        return Path(cli_db_path)

    env_db_path = os.getenv("SESSION_DB_PATH")
    if env_db_path:
        return Path(env_db_path)

    return Path(DEFAULT_DB_PATH)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Delete StreamNote test data from SQLite (sessions and auth accounts)."
    )
    parser.add_argument("--db", help="SQLite database path")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip confirmation prompt",
    )
    return parser.parse_args()


def table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def count_rows(conn: sqlite3.Connection, table_name: str) -> int:
    if not table_exists(conn, table_name):
        return 0
    row = conn.execute(f"SELECT COUNT(*) AS count FROM {table_name}").fetchone()
    return int(row["count"])


def clear_tables(db_path: Path) -> Dict[str, int]:
    if not db_path.exists():
        raise FileNotFoundError(f"Database not found: {db_path}")

    conn = sqlite3.connect(str(db_path), timeout=5.0)
    conn.row_factory = sqlite3.Row

    try:
        conn.execute("PRAGMA busy_timeout=5000")
        before_counts = {name: count_rows(conn, name) for name in TARGET_TABLES}

        conn.execute("BEGIN")
        for table_name in TARGET_TABLES:
            if table_exists(conn, table_name):
                conn.execute(f"DELETE FROM {table_name}")

        existing_tables = [name for name in TARGET_TABLES if table_exists(conn, name)]
        if existing_tables:
            placeholders = ", ".join("?" for _ in existing_tables)
            conn.execute(
                f"DELETE FROM sqlite_sequence WHERE name IN ({placeholders})",
                tuple(existing_tables),
            )

        conn.commit()
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    return before_counts


def confirm_or_exit(db_path: Path):
    prompt = (
        f"This will permanently delete test data in {db_path} "
        "(sessions and accounts). Continue? [y/N]: "
    )
    answer = input(prompt).strip().lower()
    if answer not in ("y", "yes"):
        print("[CANCELLED] No data was deleted.")
        raise SystemExit(1)


def main() -> int:
    args = parse_args()
    db_path = resolve_db_path(args.db)

    try:
        if not args.yes:
            confirm_or_exit(db_path)

        deleted_counts = clear_tables(db_path)
    except FileNotFoundError as exc:
        print(f"[ERROR] {exc}")
        return 1
    except SystemExit as exc:
        return int(exc.code)
    except Exception as exc:
        print(f"[ERROR] Failed to clear data: {exc}")
        return 1

    print("[OK] Test data cleared.")
    for table_name in TARGET_TABLES:
        print(f"  - {table_name}: deleted {deleted_counts.get(table_name, 0)} rows")

    return 0


if __name__ == "__main__":
    sys.exit(main())
