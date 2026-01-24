import os
import re
import time
import subprocess
from urllib.parse import quote
from pathlib import Path

import requests
from deep_translator import GoogleTranslator
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from db_manager import DatabaseManager
from storage_paths import RAW_DIR, ensure_storage_dirs


ensure_storage_dirs()


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


def _download_file(url: str, target_path: Path, referer: str | None = None) -> None:
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    if referer:
        headers["Referer"] = referer
    with requests.get(url, headers=headers, stream=True, timeout=30) as response:
        response.raise_for_status()
        with open(target_path, "wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)


def _download_hls(url: str, target_path: Path, referer: str | None = None) -> bool:
    try:
        cmd = ["ffmpeg", "-y"]
        if referer:
            cmd += ["-headers", f"Referer: {referer}\r\n"]
        result = subprocess.run(
            cmd + ["-i", url, "-c", "copy", str(target_path)],
            capture_output=True,
            text=True,
            check=False,
        )
        return result.returncode == 0 and target_path.exists()
    except FileNotFoundError:
        return False


def translate_to_chinese(text: str) -> str:
    override = os.getenv("CHINESE_TITLE")
    if override:
        return override
    try:
        return GoogleTranslator(source="auto", target="zh-CN").translate(text)
    except Exception:
        return text


def extract_aliexpress_title(origin_url: str) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    response = requests.get(origin_url, headers=headers, timeout=30)
    response.raise_for_status()
    html = response.text
    og_match = re.search(
        r'<meta[^>]+property="og:title"[^>]+content="([^"]+)"',
        html,
        re.IGNORECASE,
    )
    if og_match:
        return og_match.group(1).strip()
    title_match = re.search(r"<title>([^<]+)</title>", html, re.IGNORECASE)
    if title_match:
        return title_match.group(1).strip()
    return "상품"


def _collect_video_sources(page) -> list[str]:
    sources: list[str] = []
    response_urls: list[str] = []

    def handle_response(response):
        url = response.url
        content_type = response.headers.get("content-type", "")
        if any(
            keyword in content_type
            for keyword in ("video/mp4", "application/x-mpegURL", "video/quicktime")
        ):
            response_urls.append(url)
        if any(
            host in url
            for host in (
                "v.alicdn.com",
                "cloud.video.taobao.com",
                "video.aliexpress-media.com",
            )
        ):
            response_urls.append(url)

    page.on("response", handle_response)
    page.wait_for_timeout(3000)
    try:
        size = page.viewport_size or {"width": 720, "height": 1280}
        page.mouse.click(size["width"] // 2, size["height"] // 2)
        page.wait_for_timeout(3000)
        for _ in range(10):
            if page.query_selector("video") is not None:
                break
            page.wait_for_timeout(1000)
    except Exception:
        pass

    try:
        perf_urls = page.evaluate(
            "() => performance.getEntriesByType('resource').map(e => e.name)"
        )
        for url in perf_urls:
            if ".mp4" in url or ".m3u8" in url or ".ts" in url or ".flv" in url:
                response_urls.append(url)
    except Exception:
        pass

    try:
        html = page.content()
        for match in re.findall(r"https?://[^\\\"'\\s]+\\.(?:mp4|m3u8|ts|flv)", html):
            response_urls.append(match)
    except Exception:
        pass

    sources = list(dict.fromkeys(response_urls))
    return sources


def _extract_video_urls_from_scripts(html: str) -> list[str]:
    urls: list[str] = []
    script_matches = re.findall(
        r"<script[^>]*>(.*?)</script>", html, flags=re.DOTALL | re.IGNORECASE
    )
    for script in script_matches:
        if any(
            key in script
            for key in ("_runData_", "__INITIAL_DATA__", "g_config", "auction")
        ):
            for match in re.findall(
                r"https?://[^\\\"'\\s]+\\.(?:mp4|m3u8)", script
            ):
                urls.append(match)
            for match in re.findall(
                r'(?:videoUrl|video_url|main_video|hd_url)\"?\s*[:=]\s*\"([^\"]+)\"',
                script,
                flags=re.IGNORECASE,
            ):
                if match.startswith("http"):
                    urls.append(match)
    return list(dict.fromkeys(urls))


def extract_video_from_taobao(keyword: str) -> list[str]:
    search_url = f"https://m.taobao.com/search.htm?q={quote(keyword)}"
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page(viewport={"width": 720, "height": 1280})
        page.goto(search_url, wait_until="domcontentloaded", timeout=60000)
        time.sleep(3)
        links = page.eval_on_selector_all(
            "a",
            "nodes => nodes.map(n => n.href).filter(Boolean)",
        )
        browser.close()
    candidates = []
    for link in links:
        if "item.taobao.com" in link or "detail.tmall.com" in link or "/i" in link:
            candidates.append(link)
    deduped = []
    for link in candidates:
        if link not in deduped:
            deduped.append(link)
    return deduped[:10]


def download_from_cross_platform(origin_url: str, title: str) -> Path | None:
    keyword = translate_to_chinese(title)
    product_links = extract_video_from_taobao(keyword)
    if not product_links:
        return None
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page(viewport={"width": 720, "height": 1280})
        for link in product_links:
            page.goto(link, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(3000)
            html = page.content()
            sources = _extract_video_urls_from_scripts(html)
            if not sources:
                sources = _collect_video_sources(page)
            for src in sources:
                print(f"FOUND_VIDEO_URL {origin_url} -> {src}")
                target_path = _resolve_target_path(title)
                if src.startswith("blob:"):
                    continue
                if ".m3u8" in src or ".ts" in src or ".flv" in src:
                    if _download_hls(src, target_path, referer=link):
                        browser.close()
                        return target_path
                else:
                    _download_file(src, target_path, referer=link)
                    if target_path.exists():
                        browser.close()
                        return target_path
        browser.close()
    return None


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Cross-platform video downloader")
    parser.add_argument("--url", dest="origin_url")
    args = parser.parse_args()

    manager = DatabaseManager()
    if args.origin_url:
        product = manager.get_product_by_origin_url(args.origin_url)
        title = product.title if product else extract_aliexpress_title(args.origin_url)
        if product is None:
            product, _ = manager.create_product_if_not_exists(
                title=title,
                origin_url=args.origin_url,
                affiliate_url="PENDING",
                status="READY_TO_DOWNLOAD",
                track="AUTO",
            )
        path = download_from_cross_platform(args.origin_url, title)
        if path:
            manager.update_product_status_by_id(product.id, "DOWNLOADED")
            print(f"CROSS_PLATFORM_DOWNLOADED {args.origin_url} -> {path}")
        else:
            print(f"CROSS_PLATFORM_FAILED {args.origin_url}")
        return

    products = manager.get_products_by_status("READY_TO_DOWNLOAD")
    for product in products:
        path = download_from_cross_platform(
            product.origin_url, product.title or "상품"
        )
        if path:
            manager.update_product_status_by_id(product.id, "DOWNLOADED")
            print(f"CROSS_PLATFORM_DOWNLOADED {product.origin_url} -> {path}")
        else:
            print(f"CROSS_PLATFORM_FAILED {product.origin_url}")


if __name__ == "__main__":
    main()
