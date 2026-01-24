from __future__ import annotations

import sys
from pathlib import Path
import time
from sqlalchemy import text
from sqlalchemy import select

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR))

from db_manager import DatabaseManager
from models import PipelineStatus, VideoAsset


def run() -> None:
    manager = DatabaseManager()
    with manager._session() as session:
        video = session.scalars(
            select(VideoAsset)
            .where(VideoAsset.status == PipelineStatus.PROCESSED)
            .order_by(VideoAsset.created_at.desc())
            .limit(1)
        ).first()

        if not video:
            print("[UPLOAD] NO TARGET")
            return

        file_path = video.processed_path or ""
        print("[UPLOAD] START")
        print(f"video_id={video.id} file_path={file_path}")

        time.sleep(2)

        session.execute(
            text(
                "UPDATE video_assets "
                "SET status = 'UPLOADED' "
                "WHERE id = :video_id"
            ),
            {"video_id": str(video.id)},
        )
        session.commit()
        print("[UPLOAD] DONE")


if __name__ == "__main__":
    run()
