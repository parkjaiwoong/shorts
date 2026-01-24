from __future__ import annotations

import argparse
import json
import os
from datetime import datetime
import sys

from sqlalchemy import func, select, text

from db_manager import DatabaseManager
from models import Channel, PipelineStatus, UploadLog, UploadStatus, VideoAsset


def _today_range() -> tuple[datetime, datetime]:
    now = datetime.utcnow()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, now


def _build_rule_preview(channel: Channel, title: str) -> tuple[str, str]:
    prefix = channel.title_prefix or ""
    full_title = f"{prefix} {title}".strip() if prefix else title
    hashtag = channel.hashtag_template or ""
    if "{title}" in hashtag:
        hashtag = hashtag.replace("{title}", full_title)
    return full_title, hashtag


def _write_json(payload: dict) -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    print(json.dumps(payload, ensure_ascii=False))


def _normalize_storage_path(path_value: str) -> str:
    if not path_value:
        return ""
    normalized = path_value.replace("\\", "/")
    replacements = {
        "processed_videos": "storage/processed",
        "processed_video": "storage/processed",
        "raw_videos": "storage/raw",
        "downloads": "storage/downloads",
    }
    for old, new in replacements.items():
        if f"/{old}/" in f"/{normalized}/" or normalized.startswith(old):
            normalized = normalized.replace(old, new)
    return os.path.normpath(normalized)


def _summary(manager: DatabaseManager) -> None:
    start_today, end_today = _today_range()
    with manager._session() as session:
        total_channels = int(
            session.scalar(select(func.count()).select_from(Channel)) or 0
        )
        today_upload_success = int(
            session.scalar(
                select(func.count())
                .select_from(UploadLog)
                .where(UploadLog.status == UploadStatus.SUCCESS)
                .where(UploadLog.created_at >= start_today)
                .where(UploadLog.created_at <= end_today)
            )
            or 0
        )
        processed_pending = int(
            session.scalar(
                select(func.count())
                .select_from(VideoAsset)
                .where(VideoAsset.status == PipelineStatus.PROCESSED)
            )
            or 0
        )
        today_upload_failed = int(
            session.scalar(
                select(func.count())
                .select_from(UploadLog)
                .where(UploadLog.status == UploadStatus.FAILED)
                .where(UploadLog.created_at >= start_today)
                .where(UploadLog.created_at <= end_today)
            )
            or 0
        )
    _write_json(
        {
            "total_channels": total_channels,
            "today_upload_success": today_upload_success,
            "processed_pending": processed_pending,
            "today_upload_failed": today_upload_failed,
        }
    )


def _channels(manager: DatabaseManager) -> None:
    start_today, end_today = _today_range()
    payload: list[dict] = []
    with manager._session() as session:
        channels = session.scalars(select(Channel)).all()
        for channel in channels:
            today_count = int(
                session.scalar(
                    select(func.count())
                    .select_from(UploadLog)
                    .join(VideoAsset, UploadLog.video_asset_id == VideoAsset.id)
                    .where(VideoAsset.channel_id == channel.id)
                    .where(UploadLog.status == UploadStatus.SUCCESS)
                    .where(UploadLog.created_at >= start_today)
                    .where(UploadLog.created_at <= end_today)
                )
                or 0
            )
            status = (
                "READY" if today_count < channel.daily_upload_limit else "BLOCKED"
            )
            payload.append(
                {
                    "id": str(channel.id),
                    "channel_name": channel.channel_name,
                    "tone": channel.tone,
                    "subtitle_style": channel.subtitle_style,
                    "daily_upload_limit": channel.daily_upload_limit,
                    "today_count": today_count,
                    "status": status,
                    "title_prefix": channel.title_prefix or "",
                    "hashtag_template": channel.hashtag_template or "",
                    "active_yn": bool(channel.active_yn),
                }
            )
    _write_json({"channels": payload})


def _update_channel(manager: DatabaseManager, channel_id: str, payload: dict) -> None:
    with manager._session() as session:
        channel = session.get(Channel, channel_id)
        if not channel:
            _write_json({"ok": False, "error": "channel not found"})
            return
        channel.tone = payload.get("tone", channel.tone)
        channel.subtitle_style = payload.get("subtitle_style", channel.subtitle_style)
        channel.title_prefix = payload.get("title_prefix") or None
        channel.hashtag_template = payload.get("hashtag_template") or None
        session.add(channel)
        session.commit()
    _write_json({"ok": True})


def _queue(manager: DatabaseManager, channel_id: str) -> None:
    start_today, end_today = _today_range()
    with manager._session() as session:
        channel = session.get(Channel, channel_id)
        if not channel:
            _write_json({"videos": []})
            return
        today_count = int(
            session.scalar(
                select(func.count())
                .select_from(UploadLog)
                .join(VideoAsset, UploadLog.video_asset_id == VideoAsset.id)
                .where(VideoAsset.channel_id == channel.id)
                .where(UploadLog.status == UploadStatus.SUCCESS)
                .where(UploadLog.created_at >= start_today)
                .where(UploadLog.created_at <= end_today)
            )
            or 0
        )
        can_upload = today_count < channel.daily_upload_limit
        stmt = (
            select(VideoAsset)
            .where(VideoAsset.status == PipelineStatus.PROCESSED)
            .where(VideoAsset.channel_id == channel.id)
            .order_by(VideoAsset.created_at.asc())
        )
        videos = session.scalars(stmt).all()
        payload: list[dict] = []
        for video in videos:
            title_preview, hashtag_preview = _build_rule_preview(
                channel, video.product.title
            )
            payload.append(
                {
                    "video_id": str(video.id),
                    "title_preview": title_preview,
                    "hashtag_preview": hashtag_preview,
                    "can_upload": can_upload,
                }
            )
    _write_json({"videos": payload})


def _dry_run(manager: DatabaseManager) -> None:
    with manager._session() as session:
        stmt = (
            select(VideoAsset)
            .where(VideoAsset.status == PipelineStatus.PROCESSED)
            .order_by(VideoAsset.created_at.desc())
            .limit(1)
        )
        video = session.scalars(stmt).first()
        if not video:
            _write_json({"ok": False, "error": "no processed video"})
            return
        channel = video.channel
        title = video.product.title if video.product else "Untitled"
        if channel:
            title_preview, hashtag_preview = _build_rule_preview(channel, title)
        else:
            title_preview, hashtag_preview = title, ""
        payload = {
            "ok": True,
            "video_id": str(video.id),
            "file_path": _normalize_storage_path(video.processed_path or ""),
            "title": title_preview,
            "description": hashtag_preview,
            "channel_id": str(channel.id) if channel else None,
            "channel_name": channel.channel_name if channel else None,
        }
        _write_json(payload)


def _video_status_counts(manager: DatabaseManager) -> None:
    with manager._session() as session:
        ready_count = int(
            session.scalar(
                select(func.count())
                .select_from(VideoAsset)
                .where(VideoAsset.status == PipelineStatus.READY)
            )
            or 0
        )
        processed_count = int(
            session.scalar(
                select(func.count())
                .select_from(VideoAsset)
                .where(VideoAsset.status == PipelineStatus.PROCESSED)
            )
            or 0
        )
        error_count = int(
            session.scalar(
                select(func.count())
                .select_from(VideoAsset)
                .where(VideoAsset.status == PipelineStatus.ERROR)
            )
            or 0
        )
        downloaded_count = int(
            session.execute(
                text(
                    "select count(*) from video_assets where status::text = 'DOWNLOADED'"
                )
            ).scalar()
            or 0
        )
    print(f"READY={ready_count}")
    print(f"DOWNLOADED={downloaded_count}")
    print(f"PROCESSED={processed_count}")
    print(f"ERROR={error_count}")


def main() -> None:
    parser = argparse.ArgumentParser(description="UI data provider")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("summary")
    sub.add_parser("channels")
    update_parser = sub.add_parser("update-channel")
    update_parser.add_argument("--channel-id", required=True)
    update_parser.add_argument("--payload", required=True)
    queue_parser = sub.add_parser("queue")
    queue_parser.add_argument("--channel-id", required=True)
    sub.add_parser("dry-run")
    sub.add_parser("video-status-counts")
    args = parser.parse_args()

    manager = DatabaseManager()
    if args.command == "summary":
        _summary(manager)
    elif args.command == "channels":
        _channels(manager)
    elif args.command == "update-channel":
        _update_channel(manager, args.channel_id, json.loads(args.payload))
    elif args.command == "queue":
        _queue(manager, args.channel_id)
    elif args.command == "dry-run":
        _dry_run(manager)
    elif args.command == "video-status-counts":
        _video_status_counts(manager)


if __name__ == "__main__":
    main()
