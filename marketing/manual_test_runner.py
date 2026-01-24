from __future__ import annotations

from datetime import datetime
import os
import sys

from db_manager import DatabaseManager
from video_downloader import download_ready_products
from video_processor import process_downloaded


def run_manual_test() -> None:
    os.environ["TEST_MODE"] = "1"
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    manager = DatabaseManager()
    now_tag = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    title = f"테스트 상품 {now_tag}"
    origin_url = f"https://example.com/test-product-{now_tag}"

    manager.create_product_if_not_exists(
        title=title,
        origin_url=origin_url,
        affiliate_url="PENDING",
        status="READY_TO_DOWNLOAD",
        track="MANUAL",
    )
    print(f"[COLLECT] 상품 등록 {title}")

    results = list(download_ready_products(limit=1, track="MANUAL"))
    if not results:
        print("[DOWNLOAD] 영상 다운로드 실패 (대상 없음)")
        print("[PROCESS] 영상 가공 없음")
        print("[STATUS] PROCESSED 전환 없음")
        return

    result = results[0]
    if result.success:
        print(f"[DOWNLOAD] 영상 다운로드 {result.origin_url}")
    else:
        print(f"[DOWNLOAD] 영상 다운로드 실패 {result.origin_url}")

    product_ids = {result.product_id} if result.success else set()
    processed = process_downloaded(limit=1, track="MANUAL", product_ids=product_ids)
    if processed:
        print("[PROCESS] 영상 가공 완료")
        print("[STATUS] PROCESSED 전환")
    else:
        print("[PROCESS] 영상 가공 없음")
        print("[STATUS] PROCESSED 전환 없음")


if __name__ == "__main__":
    run_manual_test()
