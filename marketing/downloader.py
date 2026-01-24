import asyncio
import json
import os
import re
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import aiohttp
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async

from storage_paths import RAW_DIR, ensure_storage_dirs


CATALOG_PATH = Path("catalog.json")
ensure_storage_dirs()
RAW_VIDEOS_DIR = RAW_DIR


@dataclass
class CatalogItem:
    id: str
    source_url: str
    product_name: str
    price: str
    affiliate_link: str
    video_url: str
    downloaded_path: str
    created_at: str


def _load_catalog() -> List[Dict]:
    if not CATALOG_PATH.exists():
        return []
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def _save_catalog(items: List[Dict]) -> None:
    CATALOG_PATH.write_text(
        json.dumps(items, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


class CommerceDownloader:
    def __init__(
        self,
        user_agent: str,
        affiliate_link: str,
        timeout_ms: int = 20000,
    ) -> None:
        self.user_agent = user_agent
        self.affiliate_link = affiliate_link
        self.timeout_ms = timeout_ms
        RAW_VIDEOS_DIR.mkdir(parents=True, exist_ok=True)

    async def collect(self, urls: List[str]) -> List[CatalogItem]:
        results: List[CatalogItem] = []
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=self.user_agent,
                viewport={"width": 1280, "height": 720},
            )
            page = await context.new_page()
            await stealth_async(page)

            for url in urls:
                item = await self._collect_one(page, url)
                results.append(item)

            await context.close()
            await browser.close()

        self._append_catalog(results)
        return results

    async def _collect_one(self, page, url: str) -> CatalogItem:
        video_url_holder = {"value": ""}

        async def handle_response(response):
            if video_url_holder["value"]:
                return
            try:
                response_url = response.url
                if re.search(r"\.mp4(\?|$)", response_url):
                    video_url_holder["value"] = response_url
            except Exception:
                return

        page.on("response", handle_response)
        await page.goto(url, wait_until="domcontentloaded", timeout=self.timeout_ms)

        video_url = await self._extract_video_src(page, video_url_holder)
        product_name, price = await self._extract_product_info(page)

        filename = self._build_filename(product_name)
        download_path = RAW_VIDEOS_DIR / filename
        await self._download_video(video_url, download_path)

        return CatalogItem(
            id=self._build_id(url),
            source_url=url,
            product_name=product_name,
            price=price,
            affiliate_link=self.affiliate_link,
            video_url=video_url,
            downloaded_path=str(download_path),
            created_at=datetime.utcnow().isoformat() + "Z",
        )

    async def _extract_video_src(self, page, holder: Dict[str, str]) -> str:
        if not holder["value"]:
            try:
                await page.wait_for_timeout(2000)
                holder["value"] = await page.eval_on_selector(
                    "video",
                    "el => el.currentSrc || el.src || ''",
                )
            except Exception:
                pass

        if not holder["value"]:
            raise RuntimeError("영상 URL을 찾지 못했습니다.")

        return holder["value"]

    async def _extract_product_info(self, page) -> tuple[str, str]:
        title = ""
        price = ""

        try:
            title = await page.title()
        except Exception:
            title = ""

        try:
            price = await page.eval_on_selector(
                "[itemprop='price'], .price, .product-price",
                "el => el.textContent || ''",
            )
        except Exception:
            price = ""

        return title.strip() or "상품명 미확인", price.strip() or "가격 미확인"

    async def _download_video(self, video_url: str, output_path: Path) -> None:
        timeout = aiohttp.ClientTimeout(total=60)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(video_url, headers={"User-Agent": self.user_agent}) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"영상 다운로드 실패: {resp.status}")
                with output_path.open("wb") as f:
                    async for chunk in resp.content.iter_chunked(1024 * 1024):
                        f.write(chunk)

    def _build_filename(self, title: str) -> str:
        safe = re.sub(r"[^\w\s-]", "", title)[:40].strip() or "product"
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return f"{safe}_{timestamp}.mp4"

    def _build_id(self, url: str) -> str:
        base = re.sub(r"\W+", "", url)
        return f"{base[-12:]}_{datetime.now().strftime('%H%M%S')}"

    def _append_catalog(self, items: List[CatalogItem]) -> None:
        catalog = _load_catalog()
        catalog.extend([asdict(item) for item in items])
        _save_catalog(catalog)


def run_collect(urls: List[str], affiliate_link: str, user_agent: str) -> List[CatalogItem]:
    downloader = CommerceDownloader(user_agent=user_agent, affiliate_link=affiliate_link)
    return asyncio.run(downloader.collect(urls))
