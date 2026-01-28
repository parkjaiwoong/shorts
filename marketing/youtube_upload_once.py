from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

from googleapiclient.errors import HttpError
from sqlalchemy import func, select

from db_manager import DatabaseManager
from models import Channel, PipelineStatus, UploadLog, UploadStatus, VideoAsset
from upload_manager import _get_youtube_service, _upload_to_youtube


BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "python")
CLIENT_SECRET_PATH = os.path.join(BASE_DIR, "client_secret.json")


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
    os.environ.setdefault("YOUTUBE_CLIENT_SECRETS", CLIENT_SECRET_PATH)
    manager = DatabaseManager()
    service = _get_youtube_service()

    with manager._session() as session:
        recent_success = _get_recent_success_count(session)
        if recent_success >= 1:
            raise RuntimeError("daily limit reached (1)")

        stmt = (
            select(VideoAsset)
            .where(VideoAsset.status == PipelineStatus.PROCESSED)
            .order_by(VideoAsset.created_at.desc())
            .limit(1)
        )
        video = session.scalars(stmt).first()
        if not video:
            raise RuntimeError("no processed video")

        if not video.processed_path:
            raise RuntimeError("missing processed_path")

        file_path = Path(video.processed_path)
        if not file_path.exists():
            raise RuntimeError("missing processed file")

        channel = video.channel
        if channel and channel.platform.upper() != "YOUTUBE":
            raise RuntimeError("non-youtube channel")

        try:
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
        except HttpError as exc:
            raise exc
        except Exception as exc:
            raise exc


if __name__ == "__main__":
    try:
        run_once()
        print("UPLOAD_RESULT=SUCCESS")
        sys.exit(0)
    except Exception as exc:
        print("UPLOAD_RESULT=FAILED")
        print(f"ERROR_TYPE={exc.__class__.__name__}")
        print(f"ERROR_MESSAGE={str(exc)}")
        sys.exit(1)
