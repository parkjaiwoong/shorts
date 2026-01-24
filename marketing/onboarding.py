from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path

from sqlalchemy import select

from db_manager import DatabaseManager
from models import Channel, PipelineStatus, UploadLog, UploadStatus, VideoAsset


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Channel onboarding helper")
    parser.add_argument("--channel-name", required=True)
    parser.add_argument("--upload-frequency", type=int, default=3)
    parser.add_argument("--source-folder", required=True)
    parser.add_argument("--title-prefix", default="")
    parser.add_argument("--hashtag-template", default="")
    parser.add_argument(
        "--platform", default="YOUTUBE", choices=["YOUTUBE"]
    )
    parser.add_argument(
        "--upload-mode", default="AUTO", choices=["AUTO", "MANUAL"]
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    source_folder = Path(args.source_folder)
    if not source_folder.exists():
        raise SystemExit("source folder not found")

    manager = DatabaseManager()
    with manager._session() as session:
        channel = Channel(
            channel_name=args.channel_name,
            platform=args.platform,
            upload_mode=args.upload_mode,
            daily_upload_limit=args.upload_frequency,
            title_prefix=args.title_prefix or None,
            hashtag_template=args.hashtag_template or None,
            active_yn=True,
        )
        session.add(channel)
        session.commit()
        session.refresh(channel)

        processed = session.scalars(
            select(VideoAsset)
            .where(VideoAsset.status == PipelineStatus.PROCESSED)
            .where(VideoAsset.channel_id.is_(None))
            .order_by(VideoAsset.created_at.asc())
        ).all()

        for video in processed:
            video.channel_id = channel.id
            session.add(video)
        session.commit()

        scheduled = False
        for video in processed:
            log = UploadLog(
                video_asset_id=video.id,
                platform=channel.platform,
                scheduled_at=datetime.utcnow(),
                status=UploadStatus.PENDING,
            )
            session.add(log)
            session.commit()
            scheduled = True
            break

    mapped_count = len(processed)
    schedule_text = "예약 완료" if scheduled else "예약 대상 없음"
    print(
        f"채널 생성 완료: {args.channel_name} | "
        f"업로드빈도={args.upload_frequency} | "
        f"매핑={mapped_count} | {schedule_text}"
    )


if __name__ == "__main__":
    main()
