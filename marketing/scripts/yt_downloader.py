import os
from datetime import datetime
from pathlib import Path
from typing import Iterable, List

from moviepy.editor import VideoFileClip
from moviepy.video.fx.all import crop
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError


from storage_paths import DOWNLOADS_DIR, PROCESSED_DIR, ensure_storage_dirs


class BatchVideoDownloader:
    def __init__(
        self,
        download_dir: str | None = None,
        processed_dir: str | None = None,
    ) -> None:
        ensure_storage_dirs()
        self.download_dir = Path(download_dir) if download_dir else DOWNLOADS_DIR
        self.processed_dir = Path(processed_dir) if processed_dir else PROCESSED_DIR
        self.download_dir.mkdir(parents=True, exist_ok=True)
        self.processed_dir.mkdir(parents=True, exist_ok=True)
        self.concurrency = 1

    def download_all(self, urls: Iterable[str]) -> List[Path]:
        results: List[Path] = []
        for index, url in enumerate(urls, 1):
            results.append(self._download_and_process_sync(url, index))
        return results

    def _download_and_process_sync(self, url: str, index: int) -> Path:
        if not self._is_valid_video_url(url):
            raise ValueError(f"Unsupported or invalid URL: {url}")

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"video_{timestamp}_{index}.mp4"
        download_path = self.download_dir / filename

        ydl_opts = {
            "outtmpl": str(download_path),
            "format": "mp4/bestvideo+bestaudio/best",
            "merge_output_format": "mp4",
            "quiet": False,
            "no_warnings": False,
            "cookiesfrombrowser": ("chrome",),
            "user_agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "extractor_args": {
                "douyin": {"skip_empty_json": True},
                "tiktok": {"webpage_item_module_only": True}
            },
        }

        try:
            with YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
        except DownloadError as error:
            raise RuntimeError(f"Download failed for {url}: {error}") from error

        processed_path = self.processed_dir / filename
        self._crop_and_save(download_path, processed_path)

        if download_path.exists():
            download_path.unlink()

        return processed_path

    def _crop_and_save(self, src: Path, dst: Path) -> None:
        with VideoFileClip(str(src)) as clip:
            width, height = clip.size
            crop_x = int(width * 0.10)
            crop_y = int(height * 0.10)
            cropped = crop(
                clip,
                x1=crop_x,
                y1=crop_y,
                x2=width - crop_x,
                y2=height - crop_y,
            )
            cropped.write_videofile(
                str(dst),
                codec="libx264",
                audio_codec="aac",
                threads=os.cpu_count() or 4,
                logger=None,
            )

    @staticmethod
    def _is_valid_video_url(url: str) -> bool:
        if not url.startswith(("http://", "https://")):
            return False
        if "douyin.com" in url:
            return "/video/" in url or "v.douyin.com" in url
        if "tiktok.com" in url:
            return "/video/" in url
        return True


def main() -> None:
    urls = [
        "https://example.com/video1",
        "https://example.com/video2",
    ]
    downloader = BatchVideoDownloader()
    results = downloader.download_all(urls)
    for result in results:
        print(f"Saved: {result}")


if __name__ == "__main__":
    main()
