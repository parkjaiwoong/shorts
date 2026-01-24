import argparse
from pathlib import Path

from db_manager import DatabaseManager


def _read_urls_from_file(path: Path) -> list[str]:
    urls: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        cleaned = line.strip()
        if not cleaned or cleaned.startswith("#"):
            continue
        urls.append(cleaned)
    return urls


def _normalize_urls(urls: list[str]) -> list[str]:
    deduped: list[str] = []
    seen = set()
    for url in urls:
        if url in seen:
            continue
        seen.add(url)
        deduped.append(url)
    return deduped


def collect_product(manager: DatabaseManager, origin_url: str, title: str | None) -> None:
    existing = manager.get_product_by_origin_url(origin_url)
    if existing:
        print("Already exists:", existing.origin_url)
        return

    product, created = manager.create_product_if_not_exists(
        title=title or "PENDING",
        origin_url=origin_url,
        affiliate_url="PENDING",
        status="READY_TO_DOWNLOAD",
    )
    if created:
        print("Inserted:", product.origin_url)
    else:
        print("Already exists:", product.origin_url)


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect product data into DB.")
    parser.add_argument("origin_url", nargs="?", help="Taobao/Ali product URL")
    parser.add_argument(
        "--file",
        type=Path,
        help="Text file with one URL per line",
    )
    parser.add_argument(
        "--urls",
        nargs="*",
        help="Multiple URLs passed directly",
    )
    parser.add_argument("--title", help="Optional product title")
    args = parser.parse_args()

    urls: list[str] = []
    if args.origin_url:
        urls.append(args.origin_url)
    if args.urls:
        urls.extend(args.urls)
    if args.file:
        urls.extend(_read_urls_from_file(args.file))

    urls = _normalize_urls(urls)
    if not urls:
        raise SystemExit("No URLs provided. Use origin_url, --urls, or --file.")

    manager = DatabaseManager()
    for url in urls:
        collect_product(manager, url, args.title)


if __name__ == "__main__":
    main()
