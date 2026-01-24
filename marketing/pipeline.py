from collector import collect_product
from db_manager import DatabaseManager
from trend_scanner import scan_trends
from video_downloader import download_ready_products
from video_processor import process_downloaded


def run_pipeline(origin_url: str, title: str | None = None) -> None:
    collect_product(origin_url, title)
    download_ready_products()
    process_downloaded()


def run_auto_pipeline(count: int = 3) -> None:
    scan_trends()
    manager = DatabaseManager()
    products = manager.get_products_by_status_and_track("READY_TO_DOWNLOAD", "AUTO")
    if not products:
        print("No auto products ready.")
        return

    selected = products[:count]
    print(f"FOUND {len(selected)} auto products")
    results = list(download_ready_products(limit=len(selected), track="AUTO"))
    total = len(results)
    for index, result in enumerate(results, start=1):
        status = "OK" if result.success else "FAIL"
        print(f"DOWNLOAD {index}/{total} {status}: {result.origin_url}")
    product_ids = {result.product_id for result in results if result.success}
    processed = process_downloaded(
        limit=len(product_ids), track="AUTO", product_ids=product_ids
    )
    for index, path in enumerate(processed, start=1):
        print(f"PROCESS {index}/{len(processed)} OK: {path}")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Run collector -> downloader -> processor."
    )
    parser.add_argument("origin_url", nargs="?", help="Taobao/Ali product URL")
    parser.add_argument("--title", help="Optional product title")
    parser.add_argument("--auto", action="store_true", help="Run auto pipeline")
    parser.add_argument("--count", type=int, default=3, help="Auto product count")
    args = parser.parse_args()

    if args.auto:
        run_auto_pipeline(max(1, args.count))
    else:
        if not args.origin_url:
            raise SystemExit("origin_url required unless --auto is used.")
        run_pipeline(args.origin_url, args.title)


if __name__ == "__main__":
    main()
