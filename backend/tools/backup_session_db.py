import argparse
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

DEFAULT_DB_PATH = "backend/data/streamnote.db"


def resolve_db_path(cli_db_path: Optional[str]) -> Path:
    if cli_db_path:
        return Path(cli_db_path)

    env_db_path = os.getenv("SESSION_DB_PATH")
    if env_db_path:
        return Path(env_db_path)

    return Path(DEFAULT_DB_PATH)


def build_backup_path(db_path: Path, output_dir: Optional[str]) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_name = f"streamnote-backup-{timestamp}.db"

    if output_dir:
        backup_dir = Path(output_dir)
    else:
        backup_dir = db_path.parent / "backups"

    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir / backup_name


def backup_database(source_db: Path, backup_db: Path) -> None:
    if not source_db.exists():
        raise FileNotFoundError(f"Source database not found: {source_db}")

    src_conn = sqlite3.connect(str(source_db))
    dst_conn = sqlite3.connect(str(backup_db))

    try:
        src_conn.backup(dst_conn)
    finally:
        src_conn.close()
        dst_conn.close()


def parse_args():
    parser = argparse.ArgumentParser(description="Backup StreamNote session SQLite database")
    parser.add_argument("--db", help="Source SQLite database path")
    parser.add_argument("--output-dir", help="Directory to write backup file")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        source_db = resolve_db_path(args.db)
        backup_db = build_backup_path(source_db, args.output_dir)
        backup_database(source_db, backup_db)
    except Exception as exc:
        print(f"[ERROR] Backup failed: {exc}")
        return 1

    print(f"[OK] Backup created: {backup_db}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
