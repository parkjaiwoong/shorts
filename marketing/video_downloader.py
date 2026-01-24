import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import requests

from datetime import datetime

from db_manager import DatabaseManager
from storage_paths import (
    DOWNLOADS_DIR,
    IMPORTS_DIR,
    RAW_DIR,
    TEST_ASSETS_DIR,
    ensure_storage_dirs,
)


ensure_storage_dirs()
ECOMMERCE_HOSTS = (
    "aliexpress.com",
    "taobao.com",
    "1688.com",
    "jd.com",
    "yangkeduo.com",
)
_deno_path = Path.home() / ".deno" / "bin"
if _deno_path.exists():
    os.environ["PATH"] = f"{_deno_path}{os.pathsep}{os.environ.get('PATH','')}"


@dataclass
class DownloadResult:
    product_id: str
    origin_url: str
    raw_path: Path | None
    success: bool
    message: str


def _fetch_page(url: str) -> str:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    }
    response = requests.get(url, headers=headers, timeout=20)
    response.raise_for_status()
    return response.text


def _extract_mp4_urls(html: str) -> list[str]:
    candidates = re.findall(r"https?://[^\"'\\s]+\\.mp4", html)
    deduped: list[str] = []
    for url in candidates:
        if url not in deduped:
            deduped.append(url)
    return deduped


def _download_file(url: str, target_path: Path) -> None:
    with requests.get(url, stream=True, timeout=30) as response:
        response.raise_for_status()
        with open(target_path, "wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)


def _is_valid_video(path: Path) -> bool:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=codec_type",
                "-of",
                "default=nw=1",
                str(path),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            check=False,
        )
        if result.returncode != 0:
            return False
        return "codec_type=video" in (result.stdout or "")
    except Exception:
        return False


def _get_fallback_pool() -> list[Path]:
    raw = os.getenv("VIDEO_FALLBACK_POOL") or os.getenv("VIDEO_FALLBACK_PATH")
    if not raw:
        return []
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    pool = [Path(p) for p in parts]
    return [p for p in pool if p.exists()]


def _fallback_copy(target_path: Path, pool: list[Path]) -> bool:
    if not pool:
        return False
    source = pool.pop(0)
    shutil.copyfile(source, target_path)
    pool.append(source)
    return True


def _is_test_mode() -> bool:
    return os.getenv("TEST_MODE") == "1"


def _get_test_video_source() -> Path | None:
    env_path = os.getenv("TEST_VIDEO_PATH")
    if env_path:
        candidate = Path(env_path)
        if candidate.exists():
            return candidate

    if TEST_ASSETS_DIR.exists():
        items = list(TEST_ASSETS_DIR.glob("*.mp4"))
        if items:
            return items[0]

    raw_candidates = list(RAW_DIR.glob("*.mp4"))
    if raw_candidates:
        return raw_candidates[0]

    if IMPORTS_DIR.exists():
        items = list(IMPORTS_DIR.glob("*.mp4"))
        if items:
            return items[0]

    if DOWNLOADS_DIR.exists():
        items = list(DOWNLOADS_DIR.glob("*.mp4"))
        if items:
            return items[0]

    return None


def _test_copy(target_path: Path) -> bool:
    source = _get_test_video_source()
    if not source:
        return False
    try:
        if source.resolve() == target_path.resolve():
            return True
        shutil.copyfile(source, target_path)
        return True
    except Exception:
        return False


def _sanitize_title(title: str) -> str:
    sanitized = re.sub(r"[\\/:*?\"<>|]", "_", title).strip()
    return sanitized or "상품"


def _build_filename(title: str) -> str:
    safe_title = _sanitize_title(title).replace(" ", "_")
    return f"{safe_title}.mp4"


def _pick_mp4_from_info(info: dict) -> str | None:
    formats = info.get("formats") or []
    for fmt in formats:
        url = fmt.get("url")
        if not url:
            continue
        if fmt.get("ext") == "mp4" or ".mp4" in url:
            return url
    url = info.get("url")
    if url and (info.get("ext") == "mp4" or ".mp4" in url):
        return url
    return None


def _download_with_ytdlp(origin_url: str, target_path: Path) -> bool:
    if "aliexpress.com" in origin_url:
        return False
    try:
        import yt_dlp
    except Exception:
        return False

    output_template = str(target_path)
    ydl_opts = {
        "outtmpl": output_template,
        "format": "best[ext=mp4]/best",
        "merge_output_format": "mp4",
        "quiet": True,
        "noprogress": True,
        "no_warnings": True,
        "noplaylist": True,
        "youtube_include_dash_manifest": False,
        "extractor_args": {"youtube": {"player_client": ["android"]}},
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(origin_url, download=False)
            if "entries" in info:
                entries = info.get("entries") or []
                if not entries:
                    return False
                info = entries[0]
            mp4_url = _pick_mp4_from_info(info)
            if not mp4_url:
                return False
            _download_file(mp4_url, target_path)
        if not target_path.exists():
            return False
        if target_path.stat().st_size == 0 or not _is_valid_video(target_path):
            target_path.unlink(missing_ok=True)
            return False
        return True
    except Exception:
        return False


def _resolve_target_path(title: str) -> Path:
    base_name = _build_filename(title)
    target_path = RAW_DIR / base_name
    if not target_path.exists():
        return target_path
    stem = target_path.stem
    for index in range(2, 50):
        candidate = RAW_DIR / f"{stem}_{index}.mp4"
        if not candidate.exists():
            return candidate
    return target_path


def download_for_product(product, fallback_pool: list[Path]) -> Path | None:
    target_path = _resolve_target_path(product.title or "상품")
    if _is_test_mode():
        if _test_copy(target_path):
            return target_path
        return None
    origin_url = (product.origin_url or "").lower()
    if any(host in origin_url for host in ECOMMERCE_HOSTS):
        from social_video_hunter import find_social_video_url

        social_url = find_social_video_url(product.title or "product")
        if social_url:
            if _download_with_ytdlp(social_url, target_path):
                return target_path
            return None
        return None

    if _download_with_ytdlp(product.origin_url, target_path):
        return target_path

    try:
        html = _fetch_page(product.origin_url)
        mp4_urls = _extract_mp4_urls(html)
        if mp4_urls:
            _download_file(mp4_urls[0], target_path)
            return target_path
    except Exception:
        pass

    if _fallback_copy(target_path, fallback_pool):
        return target_path

    return None


def download_ready_products(
    limit: int | None = None, track: str | None = None
) -> Iterable[DownloadResult]:
    manager = DatabaseManager()
    if track:
        priority_products = manager.get_products_by_status_and_track(
            "PRIORITY_DOWNLOAD", track
        )
        ready_products = manager.get_products_by_status_and_track(
            "READY_TO_DOWNLOAD", track
        )
    else:
        priority_products = manager.get_products_by_status("PRIORITY_DOWNLOAD")
        ready_products = manager.get_products_by_status("READY_TO_DOWNLOAD")
    products = priority_products + ready_products
    fallback_pool = _get_fallback_pool()
    if limit is not None:
        products = products[:limit]

    results: list[DownloadResult] = []
    for product in products:
        raw_path = download_for_product(product, fallback_pool)
        if raw_path:
            manager.update_product_status_by_id(product.id, "DOWNLOADED")
            results.append(
                DownloadResult(
                    product_id=str(product.id),
                    origin_url=product.origin_url,
                    raw_path=raw_path,
                    success=True,
                    message="downloaded",
                )
            )
        else:
            manager.update_product_status_by_id(product.id, "ERROR")
            results.append(
                DownloadResult(
                    product_id=str(product.id),
                    origin_url=product.origin_url,
                    raw_path=None,
                    success=False,
                    message="no video found",
                )
            )
    return results


def main() -> None:
    results = download_ready_products()
    for result in results:
        if result.success:
            print(f"DOWNLOADED {result.origin_url} -> {result.raw_path}")
        else:
            print(f"FAILED {result.origin_url}: {result.message}")


if __name__ == "__main__":
    main()
