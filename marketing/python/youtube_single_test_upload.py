from __future__ import annotations

from pathlib import Path
import traceback

from upload_manager import _get_youtube_service, _upload_to_youtube

TEST_FILE_PATH = Path(r"D:\ai\SHOT_LO_PRO\marketing\storage\videos\processed\TEST_UPLOAD.mp4")
TITLE = "TEST_SINGLE_UPLOAD"
DESCRIPTION = "TEST_SINGLE_UPLOAD"
PRIVACY_STATUS = "private"


def _extract_video_id(url: str) -> str:
    if "v=" not in url:
        return ""
    return url.split("v=")[-1].split("&")[0]


def main() -> None:
    try:
        if not TEST_FILE_PATH.exists():
            raise RuntimeError(f"file not found: {TEST_FILE_PATH}")
        service = _get_youtube_service()
        url = _upload_to_youtube(
            service,
            TEST_FILE_PATH,
            title=TITLE,
            description=DESCRIPTION,
            privacy_status=PRIVACY_STATUS,
        )
        video_id = _extract_video_id(url)
        print(f"UPLOAD_SUCCESS videoId={video_id}")
        print(f"UPLOAD_URL {url}")
    except Exception:
        print("UPLOAD_FAILED")
        traceback.print_exc()


if __name__ == "__main__":
    main()
