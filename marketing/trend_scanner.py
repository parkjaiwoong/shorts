from datetime import datetime
from urllib.parse import urlparse

from db_manager import DatabaseManager


ALLOWED_DOMAINS = {
    "www.aliexpress.com",
    "item.taobao.com",
    "detail.1688.com",
    "item.jd.com",
    "mobile.yangkeduo.com",
}

TRENDING_PRODUCTS = [
    ("https://www.aliexpress.com/item/1005006801110823.html", "블루투스 수면 이어버드"),
    ("https://www.aliexpress.com/item/1005007098366846.html", "미니 진공 청소기"),
    ("https://item.taobao.com/item.htm?id=9000000003", "무선 차량용 청소기"),
    ("https://item.taobao.com/item.htm?id=9000000004", "올인원 피부 케어 디바이스"),
    ("https://detail.1688.com/offer/7777000111.html", "스마트 무드등 스피커"),
    ("https://detail.1688.com/offer/7777000222.html", "초경량 접이식 유모차"),
    ("https://item.jd.com/100012043978.html", "무선 키보드 마우스 세트"),
    ("https://item.jd.com/100038004353.html", "휴대용 대용량 보조배터리"),
    ("https://mobile.yangkeduo.com/goods.html?goods_id=1234567890", "캠핑용 접이식 의자"),
    ("https://mobile.yangkeduo.com/goods.html?goods_id=1234567891", "스마트 워치 충전 스탠드"),
]


def _is_supported_url(url: str) -> bool:
    domain = urlparse(url).netloc.lower()
    return domain in ALLOWED_DOMAINS


def scan_trends() -> None:
    manager = DatabaseManager()
    collected_date = datetime.now().strftime("%Y%m%d")
    for url, korean_name in TRENDING_PRODUCTS:
        if not _is_supported_url(url):
            print("SKIP unsupported source:", url)
            continue
        existing = manager.get_product_by_origin_url(url)
        if existing:
            manager.update_product_status(url, "READY_TO_DOWNLOAD")
            continue
        manager.create_product_if_not_exists(
            title=korean_name,
            origin_url=url,
            affiliate_url="PENDING",
            status="READY_TO_DOWNLOAD",
            track="AUTO",
            collected_date=collected_date,
        )
        print("AUTO:", korean_name, url)


def main() -> None:
    scan_trends()


if __name__ == "__main__":
    main()
