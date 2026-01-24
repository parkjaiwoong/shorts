import argparse
from datetime import datetime
from pathlib import Path

from db_manager import DatabaseManager


def _parse_line(line: str) -> tuple[str, str | None]:
    for sep in ("|", ",", "\t"):
        if sep in line:
            parts = [p.strip() for p in line.split(sep, 1)]
            if len(parts) == 2 and parts[0]:
                return parts[0], parts[1] or None
    return line.strip(), None


def _read_items(path: Path) -> list[tuple[str, str | None]]:
    items: list[tuple[str, str | None]] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        items.append(_parse_line(line))
    return items


def collect_manual(
    items: list[tuple[str, str | None]], default_title: str | None = None
) -> None:
    manager = DatabaseManager()
    collected_date = datetime.now().strftime("%Y%m%d")

    for origin_url, korean_name in items:
        title = korean_name or default_title
        if not title:
            raise SystemExit(
                f"Korean title required for manual item: {origin_url}"
            )
        manager.create_product_if_not_exists(
            title=title,
            origin_url=origin_url,
            affiliate_url="PENDING",
            status="PRIORITY_DOWNLOAD",
            track="MANUAL",
            collected_date=collected_date,
        )
        safe_title = title.encode("ascii", "backslashreplace").decode("ascii")
        print("MANUAL:", safe_title, origin_url)


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect manual products into DB.")
    parser.add_argument("origin_url", nargs="?", help="Taobao/Ali product URL")
    parser.add_argument("--title", help="Required Korean product title")
    parser.add_argument("--file", type=Path, help="Text file with URL|Korean name")
    parser.add_argument("--urls", nargs="*", help="Multiple URLs passed directly")
    args = parser.parse_args()

    items: list[tuple[str, str | None]] = []
    if args.origin_url:
        items.append((args.origin_url, args.title))
    if args.urls:
        for url in args.urls:
            items.append((url, args.title))
    if args.file:
        items.extend(_read_items(args.file))

    if not items:
        raise SystemExit("No URLs provided.")

    collect_manual(items, args.title)


if __name__ == "__main__":
    main()
