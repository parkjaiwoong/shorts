import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class PipelineStatus(enum.Enum):
    COLLECTING = "COLLECTING"
    COLLECTED = "COLLECTED"
    EDITING = "EDITING"
    READY = "READY"
    PROCESSED = "PROCESSED"
    UPLOADED = "UPLOADED"
    COMPLETED = "COMPLETED"
    ERROR = "ERROR"


class UploadStatus(enum.Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"


class Channel(Base):
    __tablename__ = "channels"
    __table_args__ = (
        Index("ix_channels_name", "channel_name"),
        Index("ix_channels_platform", "platform"),
        Index("ix_channels_active", "active_yn"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    channel_name: Mapped[str] = mapped_column(String(120), nullable=False)
    platform: Mapped[str] = mapped_column(String(40), nullable=False)
    upload_mode: Mapped[str] = mapped_column(String(20), nullable=False)
    daily_upload_limit: Mapped[int] = mapped_column(default=0, nullable=False)
    subtitle_style: Mapped[str] = mapped_column(
        String(20), default="BOTH", nullable=False
    )
    tone: Mapped[str] = mapped_column(String(20), default="INFORMAL", nullable=False)
    hashtag_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    title_prefix: Mapped[str | None] = mapped_column(String(80), nullable=True)
    active_yn: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    video_assets: Mapped[list["VideoAsset"]] = relationship(
        back_populates="channel"
    )


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        Index("ix_products_origin_url", "origin_url", unique=True),
        Index("ix_products_status", "status"),
        Index("ix_products_track", "track"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str | None] = mapped_column(String(120), nullable=True)
    origin_url: Mapped[str] = mapped_column(Text, nullable=False)
    origin_site: Mapped[str | None] = mapped_column(String(120), nullable=True)
    affiliate_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(60), default="READY_TO_DOWNLOAD", server_default="READY_TO_DOWNLOAD"
    )
    track: Mapped[str] = mapped_column(
        String(20), default="AUTO", server_default="AUTO"
    )
    collected_date: Mapped[str] = mapped_column(
        String(8), default="19700101", server_default="19700101"
    )
    price_info: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(String(80)), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    affiliate_links: Mapped[list["AffiliateLink"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    video_assets: Mapped[list["VideoAsset"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )


class AffiliateLink(Base):
    __tablename__ = "affiliate_links"
    __table_args__ = (
        Index("ix_affiliate_links_url", "affiliate_url", unique=True),
        Index("ix_affiliate_links_product_id", "product_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False
    )
    affiliate_url: Mapped[str] = mapped_column(Text, nullable=False)
    network: Mapped[str | None] = mapped_column(String(80), nullable=True)
    campaign_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    short_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    product: Mapped["Product"] = relationship(back_populates="affiliate_links")
    video_assets: Mapped[list["VideoAsset"]] = relationship(
        back_populates="affiliate_link"
    )


class VideoAsset(Base):
    __tablename__ = "video_assets"
    __table_args__ = (
        Index("ix_video_assets_status", "status"),
        Index("ix_video_assets_source_url", "source_url", unique=True),
        Index("ix_video_assets_channel_id", "channel_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False
    )
    affiliate_link_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("affiliate_links.id"), nullable=True
    )
    channel_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("channels.id"), nullable=True
    )
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    raw_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    processed_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    thumbnail_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[PipelineStatus] = mapped_column(
        Enum(PipelineStatus), default=PipelineStatus.COLLECTING, nullable=False
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str | None] = mapped_column(String(40), nullable=True)
    duration_sec: Mapped[int | None] = mapped_column(nullable=True)
    hashtags: Mapped[list[str] | None] = mapped_column(ARRAY(String(80)), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    product: Mapped["Product"] = relationship(back_populates="video_assets")
    affiliate_link: Mapped["AffiliateLink"] = relationship(
        back_populates="video_assets"
    )
    channel: Mapped["Channel"] = relationship(back_populates="video_assets")
    upload_logs: Mapped[list["UploadLog"]] = relationship(
        back_populates="video_asset", cascade="all, delete-orphan"
    )


class UploadLog(Base):
    __tablename__ = "upload_logs"
    __table_args__ = (
        Index("ix_upload_logs_platform_status", "platform", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    video_asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("video_assets.id"), nullable=False
    )
    platform: Mapped[str] = mapped_column(String(60), nullable=False)
    post_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    next_retry_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[UploadStatus] = mapped_column(
        Enum(UploadStatus), default=UploadStatus.PENDING, nullable=False
    )
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    video_asset: Mapped["VideoAsset"] = relationship(back_populates="upload_logs")
