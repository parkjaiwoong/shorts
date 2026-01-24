from __future__ import annotations

import os
from pathlib import Path


def _resolve_path(value: str | os.PathLike | None, fallback: Path) -> Path:
    if value:
        return Path(value)
    return fallback


STORAGE_ROOT = Path(os.getenv("STORAGE_ROOT") or "storage")

RAW_DIR = _resolve_path(os.getenv("RAW_DIR"), STORAGE_ROOT / "raw")
PROCESSED_DIR = _resolve_path(os.getenv("PROCESSED_DIR"), STORAGE_ROOT / "processed")
IMPORTS_DIR = _resolve_path(os.getenv("IMPORTS_DIR"), STORAGE_ROOT / "imports")
TEST_ASSETS_DIR = _resolve_path(os.getenv("TEST_ASSETS_DIR"), STORAGE_ROOT / "test_assets")
UPLOADS_DIR = _resolve_path(os.getenv("UPLOADS_DIR"), STORAGE_ROOT / "uploads")
DOWNLOADS_DIR = _resolve_path(os.getenv("DOWNLOADS_DIR"), STORAGE_ROOT / "downloads")
LOGS_DIR = _resolve_path(os.getenv("LOGS_DIR"), STORAGE_ROOT / "logs")


def ensure_storage_dirs() -> None:
    for path in (
        RAW_DIR,
        PROCESSED_DIR,
        IMPORTS_DIR,
        TEST_ASSETS_DIR,
        UPLOADS_DIR,
        DOWNLOADS_DIR,
        LOGS_DIR,
    ):
        path.mkdir(parents=True, exist_ok=True)
