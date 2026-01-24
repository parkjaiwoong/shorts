import json
import random
import re
import time
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import requests
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright
from playwright_stealth.stealth import Stealth

from db_manager import DatabaseManager
from storage_paths import RAW_DIR, ensure_storage_dirs


ensure_storage_dirs()
NETWORK_DUMP = Path("network_dump.txt")
NETWORK_DUMP.parent.mkdir(parents=True, exist_ok=True)


@dataclass
class DownloadResult:
    product_id: str
    origin_url: str
    raw_path: Path | None
    success: bool
    message: str


def _sanitize_title(title: str) -> str:
    sanitized = re.sub(r"[\\/:*?\"<>|]", "_", title).strip()
    return sanitized or "상품"


def _resolve_target_path(title: str) -> Path:
    base_name = f"{_sanitize_title(title).replace(' ', '_')}.mp4"
    target_path = RAW_DIR / base_name
    if not target_path.exists():
        return target_path
    stem = target_path.stem
    for index in range(2, 50):
        candidate = RAW_DIR / f"{stem}_{index}.mp4"
        if not candidate.exists():
            return candidate
    return target_path


def _download_file(url: str, target_path: Path) -> None:
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    with requests.get(url, headers=headers, stream=True, timeout=30) as response:
        response.raise_for_status()
        with open(target_path, "wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)


def _normalize_mobile_url(url: str) -> str:
    if "aliexpress.com" in url and "m.aliexpress.com" not in url:
        return re.sub(r"^https?://(www\.)?aliexpress\.com", "https://m.aliexpress.com", url)
    return url


def _find_video_urls_in_json(payload: object) -> list[str]:
    found: list[str] = []
    if isinstance(payload, dict):
        for key, value in payload.items():
            if isinstance(key, str) and "video" in key.lower() and isinstance(value, str):
                if value.startswith("http"):
                    found.append(value)
            found.extend(_find_video_urls_in_json(value))
    elif isinstance(payload, list):
        for item in payload:
            found.extend(_find_video_urls_in_json(item))
    elif isinstance(payload, str):
        if payload.startswith("http") and (".mp4" in payload or ".m3u8" in payload):
            found.append(payload)
    return found


def _append_network_dump(url: str, content_type: str) -> None:
    try:
        with NETWORK_DUMP.open("a", encoding="utf-8") as handle:
            handle.write(f"{url}\n{content_type}\n\n")
    except Exception:
        pass


def _extract_mp4_from_text(text: str) -> list[str]:
    return re.findall(r"https?://[^\\\"'\\s]+\\.mp4", text)


def _extract_video_sources(
    page_url: str, storage_state: str | None = None
) -> list[str]:
    sources: list[str] = []
    response_sources: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        iphone = p.devices.get("iPhone 14 Pro") or {}
        context = browser.new_context(
            **iphone,
            locale="ko-KR",
            storage_state=storage_state or None,
        )
        page = context.new_page()
        Stealth().apply_stealth_sync(page)

        def handle_response(response):
            url = response.url
            content_type = response.headers.get("content-type", "")
            _append_network_dump(url, content_type)
            if response.request.resource_type == "media":
                response_sources.append(url)
                return
            if ".mp4" in url or ".m3u8" in url or "video/mp4" in content_type:
                response_sources.append(url)
                return
            if "mtop" in url or "application/json" in content_type or "text/json" in content_type:
                try:
                    text = response.text()
                    for found in _extract_mp4_from_text(text):
                        response_sources.append(found)
                    data = json.loads(text)
                except Exception:
                    return
                for found in _find_video_urls_in_json(data):
                    response_sources.append(found)

        page.on("response", handle_response)
        mobile_url = _normalize_mobile_url(page_url)
        page.goto(mobile_url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(10000)
        time.sleep(random.uniform(2.5, 4.0))

        try:
            page.wait_for_selector("video", timeout=8000)
        except PlaywrightTimeoutError:
            pass

        # Simulate user scroll to trigger lazy-loaded assets.
        page.mouse.wheel(0, 1200)
        time.sleep(random.uniform(1.0, 2.5))
        page.mouse.wheel(0, 1200)
        time.sleep(random.uniform(1.0, 2.5))

        # Force click the center of the viewport to trigger video playback.
        try:
            size = page.viewport_size or {"width": 1280, "height": 720}
            page.mouse.click(size["width"] // 2, size["height"] // 2)
            time.sleep(3.0)
        except Exception:
            pass

        # Try clicking the first video element if present.
        try:
            page.click("video", timeout=1500)
            time.sleep(random.uniform(1.0, 2.0))
        except PlaywrightTimeoutError:
            pass

        # Try to open review media section and click a review video thumbnail.
        try:
            review_selectors = [
                "text=Reviews",
                "text=Review",
                "text=후기",
                "text=리뷰",
            ]
            for selector in review_selectors:
                if page.locator(selector).first.is_visible():
                    page.locator(selector).first.click()
                    time.sleep(random.uniform(2.0, 3.0))
                    break
        except Exception:
            pass

        try:
            review_video_selectors = [
                "video",
                "[data-video]",
                "img[src*='video']",
                "img[src*='mp4']",
            ]
            for selector in review_video_selectors:
                locator = page.locator(selector)
                if locator.count() > 0:
                    locator.first.click()
                    time.sleep(3.0)
                    break
        except Exception:
            pass

        # Poll for video tag rendering for up to 10 seconds.
        for _ in range(10):
            has_video = page.query_selector("video") is not None
            if has_video:
                break
            time.sleep(1.0)

        video_srcs = page.eval_on_selector_all(
            "video",
            "nodes => nodes.map(node => node.currentSrc || node.src).filter(Boolean)",
        )
        source_srcs = page.eval_on_selector_all(
            "video source",
            "nodes => nodes.map(node => node.src).filter(Boolean)",
        )
        # Try extracting from page-side JSON blobs if present.
        json_candidates = []
        for key in ("_runData_", "runParams", "__AER_DATA__", "__RUNTIME_CONFIG__"):
            try:
                data = page.evaluate(f"() => window.{key} || null")
                if data:
                    json_candidates.append(data)
            except Exception:
                continue
        for data in json_candidates:
            response_sources.extend(_find_video_urls_in_json(data))

        # Look for video URLs inside performance entries (including blob/HLS).
        try:
            perf_urls = page.evaluate(
                "() => performance.getEntriesByType('resource').map(e => e.name)"
            )
            for url in perf_urls:
                if ".mp4" in url or ".m3u8" in url:
                    response_sources.append(url)
        except Exception:
            pass

        # Scan raw HTML for video URL fragments.
        try:
            html = page.content()
            for match in re.findall(r"https?://[^\\\"'\\s]+\\.(?:mp4|m3u8)", html):
                response_sources.append(match)
        except Exception:
            pass

        sources = list(dict.fromkeys(video_srcs + source_srcs + response_sources))
        context.close()
        browser.close()
    return sources


def _download_hls(url: str, target_path: Path) -> bool:
    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                url,
                "-c",
                "copy",
                str(target_path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        return result.returncode == 0 and target_path.exists()
    except FileNotFoundError:
        return False


def download_for_product(product, storage_state: str | None = None) -> Path | None:
    target_path = _resolve_target_path(product.title or "상품")
    sources = _extract_video_sources(product.origin_url, storage_state)
    for src in sources:
        print(f"FOUND_VIDEO_URL {product.origin_url} -> {src}")
        try:
            if ".m3u8" in src:
                if _download_hls(src, target_path):
                    return target_path
                continue
            if src.startswith("blob:"):
                continue
            _download_file(src, target_path)
            if target_path.exists() and target_path.stat().st_size > 1024:
                return target_path
        except Exception:
            continue
    return None


def download_ready_products(
    limit: int | None = None,
    storage_state: str | None = None,
    origin_urls: list[str] | None = None,
) -> Iterable[DownloadResult]:
    manager = DatabaseManager()
    priority_products = manager.get_products_by_status("PRIORITY_DOWNLOAD")
    ready_products = manager.get_products_by_status("READY_TO_DOWNLOAD")
    products = priority_products + ready_products
    if origin_urls:
        product_map = {item.origin_url: item for item in products}
        products = [product_map[url] for url in origin_urls if url in product_map]
    if limit is not None:
        products = products[:limit]

    results: list[DownloadResult] = []
    for product in products:
        raw_path = download_for_product(product, storage_state)
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
    import argparse

    parser = argparse.ArgumentParser(description="Playwright video downloader")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--storage-state", dest="storage_state")
    parser.add_argument("--urls", nargs="*", help="Target origin URLs")
    args = parser.parse_args()

    results = download_ready_products(
        limit=args.limit, storage_state=args.storage_state, origin_urls=args.urls
    )
    for result in results:
        if result.success:
            print(f"DOWNLOADED {result.origin_url} -> {result.raw_path}")
        else:
            print(f"FAILED {result.origin_url}: {result.message}")


if __name__ == "__main__":
    main()
