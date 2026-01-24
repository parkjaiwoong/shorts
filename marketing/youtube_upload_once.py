from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

from googleapiclient.errors import HttpError
from sqlalchemy import func, select

from db_manager import DatabaseManager
from models import Channel, PipelineStatus, UploadLog, UploadStatus, VideoAsset
from upload_manager import _get_youtube_service, _upload_to_youtube


def _get_recent_success_count(session) -> int:
    cutoff = datetime.utcnow() - timedelta(hours=24)
    stmt = (
        select(func.count())
        .select_from(UploadLog)
        .where(UploadLog.status == UploadStatus.SUCCESS)
        .where(UploadLog.created_at >= cutoff)
    )
    return int(session.scalar(stmt) or 0)


def run_once() -> None:
    manager = DatabaseManager()
    service = _get_youtube_service()
    print("[UPLOAD][YOUTUBE] start")

    with manager._session() as session:
        recent_success = _get_recent_success_count(session)
        if recent_success >= 1:
            print("SKIP: daily limit reached (1)")
            return

        stmt = (
            select(VideoAsset)
            .where(VideoAsset.status == PipelineStatus.PROCESSED)
            .order_by(VideoAsset.created_at.desc())
            .limit(1)
        )
        video = session.scalars(stmt).first()
        if not video:
            print("NO PROCESSED VIDEO")
            return

        if not video.processed_path:
            print("MISSING processed_path")
            return

        file_path = Path(video.processed_path)
        if not file_path.exists():
            print("MISSING processed file")
            return
        print(f"[UPLOAD][YOUTUBE] target_found file={file_path}")

        channel = video.channel
        if channel and channel.platform.upper() != "YOUTUBE":
            print("SKIP: non-youtube channel")
            return

        try:
            print("[UPLOAD][YOUTUBE] api_call_start")
            title = video.product.title if video.product else "Untitled"
            post_url = _upload_to_youtube(service, file_path, title=title)
            video.status = PipelineStatus.UPLOADED
            session.add(video)
            log = UploadLog(
                video_asset_id=video.id,
                platform="YOUTUBE",
                post_url=post_url,
                published_at=datetime.utcnow(),
                status=UploadStatus.SUCCESS,
                is_published=True,
            )
            session.add(log)
            session.commit()
            print(f"[UPLOAD][YOUTUBE] success video_id={video.id}")
        except HttpError as exc:
            print(f"[UPLOAD][YOUTUBE] fail error={exc}")
        except Exception as exc:
            print(f"[UPLOAD][YOUTUBE] fail error={exc}")


if __name__ == "__main__":
    run_once()
