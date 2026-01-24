import os
import re
from pathlib import Path
from typing import Any

import requests
from deep_translator import GoogleTranslator

from db_manager import DatabaseManager
from video_processor import process_stock_video
from storage_paths import RAW_DIR, PROCESSED_DIR, ensure_storage_dirs


ensure_storage_dirs()


def _sanitize_name(value: str) -> str:
    for ch in '\\/:*?"<>|':
        value = value.replace(ch, "_")
    return value.replace(" ", "_") or "stock_video"


def _extract_aliexpress_id(url: str | None) -> str:
    if not url:
        return "unknown"
    match = re.search(r"/item/(\\d+)\\.html", url)
    return match.group(1) if match else "unknown"


def _get_korean_keyword(fallback: str) -> str:
    chinese_title = os.getenv("CHINESE_TITLE")
    source_text = chinese_title or fallback
    try:
        return GoogleTranslator(source="auto", target="ko").translate(source_text)
    except Exception:
        return fallback


def _get_product_info(origin_url: str | None) -> dict[str, Any]:
    manager = DatabaseManager()
    if origin_url:
        product = manager.get_product_by_origin_url(origin_url)
        if product:
            return {
                "title": product.title or "상품",
                "price": product.price_info or "가격 정보 없음",
                "features": product.tags or ["특징 없음"],
            }
    return {"title": "상품", "price": "가격 정보 없음", "features": ["특징 없음"]}


def _pick_vertical_video(videos: list[dict[str, Any]]) -> dict[str, Any] | None:
    vertical = [v for v in videos if v.get("height", 0) > v.get("width", 0)]
    candidates = vertical or videos
    if not candidates:
        return None
    return max(candidates, key=lambda v: v.get("height", 0))


def _pick_best_file(video: dict[str, Any]) -> str | None:
    files = video.get("video_files") or []
    if not files:
        return None
    sorted_files = sorted(
        files, key=lambda f: f.get("height", 0), reverse=True
    )
    return sorted_files[0].get("link")


def download_stock_video(keyword: str) -> Path:
    api_key = os.getenv("PEXELS_API_KEY")
    if not api_key:
        raise RuntimeError("PEXELS_API_KEY 환경 변수가 필요합니다.")

    response = requests.get(
        "https://api.pexels.com/videos/search",
        params={"query": keyword, "per_page": 10, "orientation": "portrait"},
        headers={"Authorization": api_key},
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    video = _pick_vertical_video(data.get("videos", []))
    if not video:
        raise RuntimeError("세로형 스톡 영상을 찾지 못했습니다.")
    file_url = _pick_best_file(video)
    if not file_url:
        raise RuntimeError("다운로드 가능한 video_files 링크가 없습니다.")

    target_path = RAW_DIR / f"{_sanitize_name(keyword)}.mp4"
    with requests.get(file_url, stream=True, timeout=60) as download:
        download.raise_for_status()
        with open(target_path, "wb") as handle:
            for chunk in download.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)
    return target_path


def _chunk(items: list[str], size: int) -> list[list[str]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Stock video hunter for products.")
    parser.add_argument("--origin-url", help="AliExpress origin URL")
    parser.add_argument("--origin-urls", nargs="*", help="Multiple origin URLs")
    parser.add_argument("--file", help="Text file with origin URLs")
    args = parser.parse_args()

    urls: list[str] = []
    if args.origin_url:
        urls.append(args.origin_url)
    if args.origin_urls:
        urls.extend(args.origin_urls)
    if args.file:
        urls.extend(Path(args.file).read_text(encoding="utf-8").splitlines())
    urls = [u.strip() for u in urls if u.strip()]

    if not urls:
        raise SystemExit("No origin URLs provided.")

    for batch in _chunk(urls, 3):
        for origin_url in batch:
            info = _get_product_info(origin_url)
            keyword = info["title"]
            korean_keyword = _get_korean_keyword(keyword)
            ali_id = _extract_aliexpress_id(origin_url)
            base_name = _sanitize_name(f"{korean_keyword}_{ali_id}")
            raw_path = download_stock_video(keyword)
            renamed_raw = RAW_DIR / f"{base_name}.mp4"
            if renamed_raw != raw_path:
                if renamed_raw.exists():
                    renamed_raw.unlink()
                raw_path.rename(renamed_raw)
                raw_path = renamed_raw
            output_path = PROCESSED_DIR / f"{base_name}_final.mp4"
            processed = process_stock_video(
                raw_path,
                output_path,
                info["title"],
                info["price"],
                info["features"],
            )
            coupang_query = korean_keyword.replace(" ", "+")
            coupang_link = f"https://www.coupang.com/np/search?q={coupang_query}"
            print(f"SUCCESS raw={raw_path} processed={processed}")
            print(f"[쿠팡 파트너스 검색 링크] {coupang_link}")


if __name__ == "__main__":
    main()
