import re
from typing import Iterable
from urllib.parse import quote_plus

from deep_translator import GoogleTranslator
from yt_dlp import YoutubeDL

from db_manager import DatabaseManager


def translate_variants(text: str) -> list[str]:
    variants = [text]
    try:
        zh = GoogleTranslator(source="auto", target="zh-CN").translate(text)
        if zh and zh not in variants:
            variants.append(zh)
    except Exception:
        pass
    try:
        en = GoogleTranslator(source="auto", target="en").translate(text)
        if en and en not in variants:
            variants.append(en)
    except Exception:
        pass
    return variants


def build_queries(name: str) -> list[str]:
    suffixes = [
        "review",
        "unboxing",
        "gadget",
        "shorts",
        "tiktok",
        "instagram reel",
        "제품 리뷰",
        "언박싱",
    ]
    queries = []
    for variant in translate_variants(name):
        queries.append(variant)
        for suffix in suffixes:
            queries.append(f"{variant} {suffix}")
    return list(dict.fromkeys(queries))


def _pick_mp4_url(info: dict) -> str | None:
    formats = info.get("formats") or []
    for fmt in formats:
        url = fmt.get("url")
        if not url:
            continue
        if fmt.get("ext") == "mp4" or ".mp4" in url:
            return url
    return None


def find_youtube_short_video_url(queries: Iterable[str]) -> str | None:
    ydl_opts = {
        "quiet": True,
        "noprogress": True,
        "skip_download": True,
        "extract_flat": False,
    }
    with YoutubeDL(ydl_opts) as ydl:
        for query in queries:
            info = ydl.extract_info(f"ytsearch1:{query}", download=False)
            entries = info.get("entries") or []
            if not entries:
                continue
            first = entries[0]
            video_url = _pick_mp4_url(first)
            if video_url:
                return video_url
    return None


def find_dailymotion_video_url(queries: Iterable[str]) -> str | None:
    for query in queries:
        url = f"https://www.dailymotion.com/search/{quote_plus(query)}/videos"
        try:
            html = _fetch_search_page(url)
            matches = re.findall(r"/video/([a-zA-Z0-9]+)", html)
            if matches:
                return f"https://www.dailymotion.com/video/{matches[0]}"
        except Exception:
            continue
    return None


def _fetch_search_page(url: str) -> str:
    import requests

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    }
    response = requests.get(url, headers=headers, timeout=15)
    response.raise_for_status()
    return response.text


def _extract_tiktok_urls(html: str) -> list[str]:
    return list(
        dict.fromkeys(
            re.findall(r"https?://www\\.tiktok\\.com/@[^\\s\"']+/video/\\d+", html)
        )
    )


def _extract_instagram_urls(html: str) -> list[str]:
    return list(
        dict.fromkeys(
            re.findall(r"https?://www\\.instagram\\.com/reel/[^\\s\"']+", html)
        )
    )


def find_tiktok_video_url(queries: Iterable[str]) -> str | None:
    for query in queries:
        url = f"https://www.tiktok.com/search?q={quote_plus(query)}"
        try:
            html = _fetch_search_page(url)
            candidates = _extract_tiktok_urls(html)
            if candidates:
                return candidates[0]
        except Exception:
            continue
    return None


def find_instagram_reel_url(queries: Iterable[str]) -> str | None:
    for query in queries:
        url = f"https://www.instagram.com/explore/search/keyword/?q={quote_plus(query)}"
        try:
            html = _fetch_search_page(url)
            candidates = _extract_instagram_urls(html)
            if candidates:
                return candidates[0]
        except Exception:
            continue
    return None


def find_social_video_url(name: str) -> str | None:
    queries = build_queries(name)
    found = find_tiktok_video_url(queries)
    if found:
        return found
    found = find_instagram_reel_url(queries)
    if found:
        return found
    found = find_dailymotion_video_url(queries)
    if found:
        return found
    found = find_youtube_short_video_url(queries)
    if found:
        return found
    return None


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Find social video for product.")
    parser.add_argument("--origin-url", required=True)
    args = parser.parse_args()

    manager = DatabaseManager()
    product = manager.get_product_by_origin_url(args.origin_url)
    title = product.title if product else args.origin_url

    found = find_social_video_url(title)
    if found:
        print(f"FOUND_VIDEO_URL {args.origin_url} -> {found}")
    else:
        print(f"NO_VIDEO_FOUND {args.origin_url}")


if __name__ == "__main__":
    main()
