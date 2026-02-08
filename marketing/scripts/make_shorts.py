import argparse
import os
import subprocess
from pathlib import Path


TARGET_MIN_SECONDS = 15
TARGET_MAX_SECONDS = 30
DEFAULT_CAPTION = "지금 문의하세요"


def _find_font_path() -> str | None:
    candidates = [
        r"C:\Windows\Fonts\malgun.ttf",
        r"C:\Windows\Fonts\malgunbd.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return path
    return None


def _probe_duration(input_path: Path) -> float:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(input_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "ffprobe failed")
    return float(result.stdout.strip() or 0)


def _build_drawtext(text: str) -> str:
    font_path = _find_font_path()
    font_part = f"fontfile='{font_path}':" if font_path else ""
    safe_text = text.replace(":", "\\:")
    return (
        f"drawtext={font_part}"
        f"text='{safe_text}':"
        "x=(w-text_w)/2:"
        "y=h-(text_h*2):"
        "fontsize=48:"
        "fontcolor=white:"
        "box=1:"
        "boxcolor=black@0.45:"
        "boxborderw=10"
    )


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a shorts-ready mp4.")
    parser.add_argument("input", help="Input mp4 path")
    parser.add_argument("--text", default=DEFAULT_CAPTION, help="Caption text")
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    if not input_path.exists():
        raise SystemExit(f"input not found: {input_path}")

    duration = _probe_duration(input_path)
    target_len = min(TARGET_MAX_SECONDS, duration)
    if target_len < TARGET_MIN_SECONDS:
        print(f"[WARN] duration {duration:.2f}s below {TARGET_MIN_SECONDS}s target")

    output_dir = Path("storage/videos/processed").resolve()
    _ensure_dir(output_dir)
    output_name = f"{input_path.stem}__shorts.mp4"
    output_path = output_dir / output_name

    drawtext = _build_drawtext(args.text)
    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        "0",
        "-t",
        f"{target_len:.2f}",
        "-i",
        str(input_path),
        "-vf",
        drawtext,
        "-af",
        "loudnorm=I=-14:LRA=11:TP=-1.5",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    result = subprocess.run(cmd, text=True, check=False)
    if result.returncode != 0:
        raise SystemExit("ffmpeg failed")

    print(f"OUTPUT={output_path}")


if __name__ == "__main__":
    main()
