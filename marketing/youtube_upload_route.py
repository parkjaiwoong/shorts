from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path

from googleapiclient.errors import HttpError
from sqlalchemy import select

from db_manager import DatabaseManager
from models import PipelineStatus, UploadLog, UploadStatus, VideoAsset
from upload_manager import _get_youtube_service, _upload_to_youtube
from storage_paths import PROCESSED_DIR, UPLOADS_DIR, ensure_storage_dirs


def _write_json(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False))


def _next_publish_at() -> str:
    now = datetime.now(timezone.utc)
    rounded = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    return rounded.strftime("%Y-%m-%dT%H:%M:%SZ")


def _classify_error(exc: Exception) -> str:
    message = str(exc).lower()
    if "quota" in message or "daily limit" in message:
        return "quota"
    return "unknown"


def run() -> None:
    ensure_storage_dirs()
    manager = DatabaseManager()
    service = _get_youtube_service()
    env_title = os.environ.get("YOUTUBE_TITLE") or ""
    env_description = os.environ.get("YOUTUBE_DESCRIPTION") or ""
    env_tags = os.environ.get("YOUTUBE_TAGS_JSON") or ""
    env_privacy = os.environ.get("YOUTUBE_PRIVACY_STATUS") or "private"
    try:
        parsed_tags = json.loads(env_tags) if env_tags else []
    except Exception:
        parsed_tags = []
    tags = [str(tag) for tag in parsed_tags if str(tag).strip()]

    manual_upload = os.environ.get("MANUAL_UPLOAD_PATH")
    if manual_upload:
        file_path = Path(manual_upload)
        if not file_path.exists():
            _write_json({"ok": False, "error": "manual upload file not found"})
            return
        try:
            title = env_title or file_path.stem
            description = env_description or title
            publish_at = _next_publish_at() if env_privacy == "private" else None
            post_url = _upload_to_youtube(
                service,
                file_path,
                title=title,
                description=description,
                tags=tags,
                privacy_status=env_privacy,
                publish_at=publish_at,
            )
            try:
                uploads_dir = UPLOADS_DIR / "youtube"
                uploads_dir.mkdir(parents=True, exist_ok=True)
                target_name = f"manual_{file_path.name}"
                target_path = uploads_dir / target_name
                if not target_path.exists():
                    shutil.copy2(file_path, target_path)
            except Exception:
                pass
            _write_json(
                {
                    "ok": True,
                    "video_id": "manual",
                    "post_url": post_url,
                    "publish_at": publish_at,
                }
            )
            return
        except HttpError as exc:
            error_type = _classify_error(exc)
            _write_json({"ok": False, "error": str(exc), "type": error_type})
            return
        except Exception as exc:
            _write_json({"ok": False, "error": str(exc), "type": "unknown"})
            return

    with manager._session() as session:
        target_channel_id = os.environ.get("TARGET_CHANNEL_ID") or None
        query = select(VideoAsset).where(VideoAsset.status == PipelineStatus.PROCESSED)
        if target_channel_id:
            query = query.where(VideoAsset.channel_id == target_channel_id)
        video = session.scalars(
            query.order_by(VideoAsset.created_at.desc()).limit(1)
        ).first()
        if not video:
            _write_json({"message": "업로드 대상 없음"})
            return

        file_path = Path(video.processed_path or "")
        if video.processed_path and not file_path.exists():
            legacy_name = Path(video.processed_path).name
            candidate = PROCESSED_DIR / legacy_name
            if candidate.exists():
                file_path = candidate
        print("[UPLOAD][YOUTUBE] START")
        print(f"video_id={video.id} file_path={file_path}")

        if not file_path.exists():
            video.status = PipelineStatus.ERROR
            video.error_message = "processed file not found"
            session.add(video)
            session.commit()
            _write_json({"ok": False, "error": "processed file not found"})
            return

        try:
            publish_at = _next_publish_at() if env_privacy == "private" else None
            title = env_title or (video.product.title if video.product else "Untitled")
            description = env_description or title
            post_url = _upload_to_youtube(
                service,
                file_path,
                title=title,
                description=description,
                tags=tags,
                privacy_status=env_privacy,
                publish_at=publish_at,
            )
            try:
                uploads_dir = UPLOADS_DIR / "youtube"
                uploads_dir.mkdir(parents=True, exist_ok=True)
                target_name = f"{video.id}_{file_path.name}"
                target_path = uploads_dir / target_name
                if not target_path.exists():
                    shutil.copy2(file_path, target_path)
            except Exception:
                pass
            video.status = PipelineStatus.UPLOADED
            video.error_message = None
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
            _write_json(
                {
                    "ok": True,
                    "video_id": str(video.id),
                    "post_url": post_url,
                    "publish_at": publish_at,
                }
            )
        except HttpError as exc:
            error_type = _classify_error(exc)
            if error_type != "quota":
                video.status = PipelineStatus.ERROR
            video.error_message = str(exc)
            session.add(video)
            session.commit()
            _write_json({"ok": False, "error": str(exc), "type": error_type})
        except Exception as exc:
            video.status = PipelineStatus.ERROR
            video.error_message = str(exc)
            session.add(video)
            session.commit()
            _write_json({"ok": False, "error": str(exc), "type": "unknown"})


if __name__ == "__main__":
    run()
