from __future__ import annotations

import os
import pickle
from pathlib import Path
from datetime import datetime, timedelta

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload
from sqlalchemy import func, select

from db_manager import DatabaseManager
from models import Channel, PipelineStatus, UploadLog, UploadStatus, VideoAsset


SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def _get_youtube_service() -> object:
    client_secrets = os.getenv("YOUTUBE_CLIENT_SECRETS", "client_secrets.json")
    token_path = os.getenv("YOUTUBE_TOKEN_PATH", "token.json")

    creds = None
    token_is_pickle = token_path.endswith(".pickle")
    if Path(token_path).exists():
        if token_is_pickle:
            try:
                with open(token_path, "rb") as handle:
                    creds = pickle.load(handle)
            except Exception:
                creds = Credentials.from_authorized_user_file(token_path, SCOPES)
        else:
            creds = Credentials.from_authorized_user_file(token_path, SCOPES)
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        if token_is_pickle:
            with open(token_path, "wb") as handle:
                pickle.dump(creds, handle)
        else:
            Path(token_path).write_text(creds.to_json(), encoding="utf-8")

    if not creds or not creds.valid:
        flow = InstalledAppFlow.from_client_secrets_file(client_secrets, SCOPES)
        creds = flow.run_local_server(port=0)
        if token_is_pickle:
            with open(token_path, "wb") as handle:
                pickle.dump(creds, handle)
        else:
            Path(token_path).write_text(creds.to_json(), encoding="utf-8")

    return build("youtube", "v3", credentials=creds)


def _upload_to_youtube(
    service,
    file_path: Path,
    title: str,
    description: str | None = None,
    tags: list[str] | None = None,
    privacy_status: str = "public",
    publish_at: str | None = None,
) -> str:
    print("[UPLOAD][YOUTUBE] FUNCTION ENTERED")
    status_payload: dict[str, str] = {"privacyStatus": privacy_status}
    if publish_at:
        status_payload["publishAt"] = publish_at
    snippet = {
        "title": title,
        "description": description or title,
    }
    if tags:
        snippet["tags"] = tags
    body = {"snippet": snippet, "status": status_payload}
    media = MediaFileUpload(str(file_path), chunksize=-1, resumable=True)
    request = service.videos().insert(part="snippet,status", body=body, media_body=media)
    response = request.execute()
    return f"https://www.youtube.com/watch?v={response.get('id')}"


def _get_recent_success_count(session, channel: Channel) -> int:
    cutoff = datetime.utcnow() - timedelta(hours=24)
    stmt = (
        select(func.count())
        .select_from(UploadLog)
        .join(VideoAsset, UploadLog.video_asset_id == VideoAsset.id)
        .where(VideoAsset.channel_id == channel.id)
        .where(UploadLog.status == UploadStatus.SUCCESS)
        .where(UploadLog.created_at >= cutoff)
    )
    return int(session.scalar(stmt) or 0)


def _get_latest_log(session, video_id) -> UploadLog | None:
    stmt = (
        select(UploadLog)
        .where(UploadLog.video_asset_id == video_id)
        .order_by(UploadLog.created_at.desc())
        .limit(1)
    )
    return session.scalars(stmt).first()


def _classify_error(exc: Exception) -> tuple[str, datetime | None]:
    message = str(exc).lower()
    if "quota" in message or "daily limit" in message:
        return "quota", datetime.utcnow() + timedelta(hours=24)
    if "auth" in message or "unauthorized" in message or "invalid" in message:
        return "auth", None
    if "duplicate" in message:
        return "duplicate", None
    return "unknown", datetime.utcnow() + timedelta(hours=2)


def _select_videos_for_channel(
    session, channel: Channel, remaining: int
) -> list[VideoAsset]:
    if remaining <= 0:
        return []
    stmt = (
        select(VideoAsset)
        .where(
            VideoAsset.status.in_(
                [PipelineStatus.PROCESSED, PipelineStatus.ERROR]
            )
        )
        .where(VideoAsset.channel_id == channel.id)
        .order_by(VideoAsset.created_at.asc())
        .limit(remaining)
    )
    candidates = list(session.scalars(stmt).all())
    ready: list[VideoAsset] = []
    now = datetime.utcnow()
    for video in candidates:
        latest = _get_latest_log(session, video.id)
        if latest and latest.status == UploadStatus.FAILED:
            if latest.next_retry_at and latest.next_retry_at > now:
                continue
        ready.append(video)
    return ready


def run_uploads(channel_id: str | None = None) -> None:
    manager = DatabaseManager()
    service = _get_youtube_service()

    with manager._session() as session:
        stmt = select(Channel).where(Channel.active_yn.is_(True))
        if channel_id:
            stmt = stmt.where(Channel.id == channel_id)
        channels = session.scalars(stmt).all()

        for channel in channels:
            if channel.platform.upper() != "YOUTUBE":
                continue
            recent_success = _get_recent_success_count(session, channel)
            remaining = max(0, channel.daily_upload_limit - recent_success)
            if remaining <= 0:
                print(
                    f"SKIP {channel.channel_name}: daily limit reached ({recent_success})"
                )
                continue
            videos = _select_videos_for_channel(session, channel, remaining)
            for video in videos:
                try:
                    if not video.processed_path:
                        raise RuntimeError("processed_path is missing")
                    file_path = Path(video.processed_path)
                    if not file_path.exists():
                        raise RuntimeError("processed_path not found")
                    post_url = _upload_to_youtube(
                        service, file_path, title=video.product.title
                    )
                    video.status = PipelineStatus.UPLOADED
                    video.error_message = None
                    session.add(video)
                    log = UploadLog(
                        video_asset_id=video.id,
                        platform=channel.platform,
                        post_url=post_url,
                        published_at=datetime.utcnow(),
                        status=UploadStatus.SUCCESS,
                        is_published=True,
                    )
                    session.add(log)
                    session.commit()
                    print(f"UPLOADED {video.id} -> {post_url}")
                except HttpError as exc:
                    error_type, retry_at = _classify_error(exc)
                    video.status = PipelineStatus.ERROR
                    video.error_message = f"{error_type}: {exc}"
                    session.add(video)
                    log = UploadLog(
                        video_asset_id=video.id,
                        platform=channel.platform,
                        status=UploadStatus.FAILED,
                        is_published=False,
                        next_retry_at=retry_at,
                    )
                    session.add(log)
                    session.commit()
                    print(f"UPLOAD FAIL {video.id}: {exc}")
                except Exception as exc:
                    error_type, retry_at = _classify_error(exc)
                    video.status = PipelineStatus.ERROR
                    video.error_message = f"{error_type}: {exc}"
                    session.add(video)
                    log = UploadLog(
                        video_asset_id=video.id,
                        platform=channel.platform,
                        status=UploadStatus.FAILED,
                        is_published=False,
                        next_retry_at=retry_at,
                    )
                    session.add(log)
                    session.commit()
                    print(f"UPLOAD FAIL {video.id}: {exc}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Upload processed shorts")
    parser.add_argument("--channel-id", dest="channel_id")
    args = parser.parse_args()

    run_uploads(channel_id=args.channel_id)
