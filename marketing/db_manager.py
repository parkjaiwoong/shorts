import os
from typing import Iterable
from urllib.parse import quote_plus

from dotenv import load_dotenv
from sqlalchemy import create_engine, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, sessionmaker

from models import (
    AffiliateLink,
    PipelineStatus,
    Product,
    UploadLog,
    UploadStatus,
    VideoAsset,
)


load_dotenv()


def _get_env_value(*keys: str) -> str | None:
    for key in keys:
        value = os.getenv(key)
        if value:
            return value
    return None


def _get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return database_url

    host = _get_env_value("DB_HOST", "RDS_HOSTNAME")
    port = _get_env_value("DB_PORT", "RDS_PORT") or "5432"
    name = _get_env_value("DB_NAME", "RDS_DB_NAME")
    user = _get_env_value("DB_USER", "RDS_USERNAME")
    password = _get_env_value("DB_PASSWORD", "RDS_PASSWORD")

    missing = [key for key, value in {
        "DB_HOST": host,
        "DB_NAME": name,
        "DB_USER": user,
        "DB_PASSWORD": password,
    }.items() if not value]
    if missing:
        raise RuntimeError(
            "DB 연결 정보를 찾을 수 없습니다. "
            "DATABASE_URL 또는 DB_HOST/DB_NAME/DB_USER/DB_PASSWORD(또는 RDS_* 변수를) 설정하세요."
        )

    return (
        f"postgresql+psycopg2://{user}:{quote_plus(password)}@{host}:{port}/{name}"
    )


class DatabaseManager:
    def __init__(self) -> None:
        self.engine = create_engine(_get_database_url(), pool_pre_ping=True)
        self.SessionLocal = sessionmaker(bind=self.engine, expire_on_commit=False)

    def _session(self) -> Session:
        return self.SessionLocal()

    def upsert_product(
        self,
        title: str,
        origin_url: str,
        category: str | None = None,
        origin_site: str | None = None,
        affiliate_url: str | None = None,
        status: str = "READY_TO_DOWNLOAD",
        track: str = "AUTO",
        collected_date: str | None = None,
        price_info: str | None = None,
        tags: list[str] | None = None,
    ) -> Product:
        with self._session() as session:
            stmt = insert(Product).values(
                title=title,
                origin_url=origin_url,
                category=category,
                origin_site=origin_site,
                affiliate_url=affiliate_url,
                status=status,
                track=track,
                collected_date=collected_date,
                price_info=price_info,
                tags=tags,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[Product.origin_url],
                set_={
                    "title": stmt.excluded.title,
                    "category": stmt.excluded.category,
                    "origin_site": stmt.excluded.origin_site,
                    "affiliate_url": stmt.excluded.affiliate_url,
                    "status": stmt.excluded.status,
                    "track": stmt.excluded.track,
                    "collected_date": stmt.excluded.collected_date,
                    "price_info": stmt.excluded.price_info,
                    "tags": stmt.excluded.tags,
                },
            ).returning(Product)
            product = session.execute(stmt).scalar_one()
            session.commit()
            return product

    def get_product_by_origin_url(self, origin_url: str) -> Product | None:
        with self._session() as session:
            return session.scalar(
                select(Product).where(Product.origin_url == origin_url)
            )

    def create_product_if_not_exists(
        self,
        title: str,
        origin_url: str,
        category: str | None = None,
        origin_site: str | None = None,
        affiliate_url: str | None = None,
        status: str = "READY_TO_DOWNLOAD",
        track: str = "AUTO",
        collected_date: str | None = None,
        price_info: str | None = None,
        tags: list[str] | None = None,
    ) -> tuple[Product, bool]:
        with self._session() as session:
            existing = session.scalar(
                select(Product).where(Product.origin_url == origin_url)
            )
            if existing:
                return existing, False
            product = Product(
                title=title,
                origin_url=origin_url,
                category=category,
                origin_site=origin_site,
                affiliate_url=affiliate_url,
                status=status,
                track=track,
                collected_date=collected_date,
                price_info=price_info,
                tags=tags,
            )
            session.add(product)
            session.commit()
            session.refresh(product)
            return product, True

    def update_product_status(self, origin_url: str, status: str) -> None:
        with self._session() as session:
            stmt = (
                update(Product)
                .where(Product.origin_url == origin_url)
                .values(status=status)
            )
            session.execute(stmt)
            session.commit()

    def update_product_status_by_id(self, product_id, status: str) -> None:
        with self._session() as session:
            stmt = (
                update(Product)
                .where(Product.id == product_id)
                .values(status=status)
            )
            session.execute(stmt)
            session.commit()

    def get_products_by_status(self, status: str) -> Iterable[Product]:
        with self._session() as session:
            return session.scalars(
                select(Product).where(Product.status == status)
            ).all()

    def get_products_by_status_and_track(
        self, status: str, track: str
    ) -> Iterable[Product]:
        with self._session() as session:
            return session.scalars(
                select(Product)
                .where(Product.status == status)
                .where(Product.track == track)
            ).all()

    def bulk_update_affiliate_urls(self, mapping: dict[str, str]) -> int:
        if not mapping:
            return 0

        with self._session() as session:
            updated = 0
            for origin_url, affiliate_url in mapping.items():
                stmt = (
                    update(Product)
                    .where(Product.origin_url == origin_url)
                    .values(affiliate_url=affiliate_url)
                )
                result = session.execute(stmt)
                updated += result.rowcount or 0
            session.commit()
            return updated

    def upsert_affiliate_link(
        self,
        product_id,
        affiliate_url: str,
        network: str | None = None,
        campaign_code: str | None = None,
        short_url: str | None = None,
        is_active: bool = True,
    ) -> AffiliateLink:
        with self._session() as session:
            stmt = insert(AffiliateLink).values(
                product_id=product_id,
                affiliate_url=affiliate_url,
                network=network,
                campaign_code=campaign_code,
                short_url=short_url,
                is_active=is_active,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[AffiliateLink.affiliate_url],
                set_={
                    "product_id": stmt.excluded.product_id,
                    "network": stmt.excluded.network,
                    "campaign_code": stmt.excluded.campaign_code,
                    "short_url": stmt.excluded.short_url,
                    "is_active": stmt.excluded.is_active,
                },
            ).returning(AffiliateLink)
            link = session.execute(stmt).scalar_one()
            session.commit()
            return link

    def upsert_video_asset(
        self,
        product_id,
        source_url: str,
        affiliate_link_id=None,
        channel_id=None,
        raw_path: str | None = None,
        processed_path: str | None = None,
        thumbnail_path: str | None = None,
        status: PipelineStatus = PipelineStatus.COLLECTING,
        error_message: str | None = None,
        language: str | None = None,
        duration_sec: int | None = None,
        hashtags: list[str] | None = None,
    ) -> VideoAsset:
        with self._session() as session:
            stmt = insert(VideoAsset).values(
                product_id=product_id,
                source_url=source_url,
                affiliate_link_id=affiliate_link_id,
                channel_id=channel_id,
                raw_path=raw_path,
                processed_path=processed_path,
                thumbnail_path=thumbnail_path,
                status=status,
                error_message=error_message,
                language=language,
                duration_sec=duration_sec,
                hashtags=hashtags,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[VideoAsset.source_url],
                set_={
                    "product_id": stmt.excluded.product_id,
                    "affiliate_link_id": stmt.excluded.affiliate_link_id,
                    "channel_id": stmt.excluded.channel_id,
                    "raw_path": stmt.excluded.raw_path,
                    "processed_path": stmt.excluded.processed_path,
                    "thumbnail_path": stmt.excluded.thumbnail_path,
                    "status": stmt.excluded.status,
                    "error_message": stmt.excluded.error_message,
                    "language": stmt.excluded.language,
                    "duration_sec": stmt.excluded.duration_sec,
                    "hashtags": stmt.excluded.hashtags,
                },
            ).returning(VideoAsset)
            asset = session.execute(stmt).scalar_one()
            session.commit()
            return asset

    def update_video_status(
        self,
        status: PipelineStatus,
        video_id=None,
        source_url: str | None = None,
        error_message: str | None = None,
    ) -> None:
        if not video_id and not source_url:
            raise ValueError("video_id 또는 source_url이 필요합니다.")

        with self._session() as session:
            stmt = update(VideoAsset).values(
                status=status,
                error_message=error_message,
            )
            if video_id:
                stmt = stmt.where(VideoAsset.id == video_id)
            else:
                stmt = stmt.where(VideoAsset.source_url == source_url)
            session.execute(stmt)
            session.commit()

    def link_video_to_affiliate(self, video_id, affiliate_link_id) -> None:
        with self._session() as session:
            stmt = (
                update(VideoAsset)
                .where(VideoAsset.id == video_id)
                .values(affiliate_link_id=affiliate_link_id)
            )
            session.execute(stmt)
            session.commit()

    def get_videos_by_status(
        self, status: PipelineStatus
    ) -> Iterable[VideoAsset]:
        with self._session() as session:
            return session.scalars(
                select(VideoAsset).where(VideoAsset.status == status)
            ).all()

    def add_upload_log(
        self,
        video_asset_id,
        platform: str,
        scheduled_at=None,
        status: UploadStatus = UploadStatus.PENDING,
    ) -> UploadLog:
        with self._session() as session:
            log = UploadLog(
                video_asset_id=video_asset_id,
                platform=platform,
                scheduled_at=scheduled_at,
                status=status,
            )
            session.add(log)
            session.commit()
            session.refresh(log)
            return log

    def get_pending_uploads(
        self, platform: str | None = None
    ) -> Iterable[UploadLog]:
        with self._session() as session:
            stmt = select(UploadLog).where(UploadLog.is_published.is_(False))
            if platform:
                stmt = stmt.where(UploadLog.platform == platform)
            return session.scalars(stmt).all()
