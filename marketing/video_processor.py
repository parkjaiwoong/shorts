import os
import random
import shutil
import subprocess
from sqlalchemy import select
from pathlib import Path
import textwrap

from db_manager import DatabaseManager
from models import Channel, PipelineStatus, VideoAsset
from storage_paths import PROCESSED_DIR, RAW_DIR, ensure_storage_dirs


ensure_storage_dirs()


def _pick_bgm_path() -> Path | None:
    candidates = []
    bgm_dir = Path("video_bgm")
    if bgm_dir.exists():
        candidates.extend(bgm_dir.glob("*.mp3"))
        candidates.extend(bgm_dir.glob("*.wav"))
    return candidates[0] if candidates else None


def _pick_cta_text() -> str:
    options = [
        "품절주의! 프로필 링크 클릭",
        "지금 안 사면 손해! 프로필 링크",
        "핵가성비! 프로필 링크 확인",
        "오늘만 특가! 프로필 링크 클릭",
        "인기 폭발! 프로필 링크 확인",
    ]
    return random.choice(options)


def _pick_cta_text_by_tone(tone: str) -> str:
    tone = (tone or "INFORMAL").upper()
    if tone == "FORMAL":
        options = [
            "프로필 링크를 확인해 주세요.",
            "자세한 내용은 프로필 링크에서 확인하세요.",
            "공식 링크에서 확인 부탁드립니다.",
        ]
    elif tone == "SALES":
        options = [
            "지금 구매하면 혜택! 프로필 링크",
            "세일 마감 전 구매! 프로필 링크",
            "오늘만 특가! 프로필 링크 클릭",
        ]
    else:
        options = [
            "품절주의! 프로필 링크 클릭",
            "지금 안 사면 손해! 프로필 링크",
            "핵가성비! 프로필 링크 확인",
        ]
    return random.choice(options)


def _get_font_path() -> str | None:
    font_path = os.getenv("FONT_PATH")
    if font_path and Path(font_path).exists():
        return font_path
    default_path = Path("C:/Windows/Fonts/malgun.ttf")
    if default_path.exists():
        return str(default_path)
    return None


def _escape_drawtext(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("\n", "\\n")
    )


def _clean_text(text: str) -> str:
    cleaned = text.replace("\\n", " ").replace("\\t", " ").replace("ctn", " ")
    cleaned = cleaned.replace("\r", " ").replace("\t", " ").replace("\n", " ")
    cleaned = " ".join(cleaned.split()).strip()
    return cleaned


def _wrap_for_width(text: str, width_chars: int = 20, max_lines: int = 3) -> str:
    wrapped = textwrap.fill(_clean_text(text), width=width_chars)
    lines = wrapped.split("\n")
    return "\n".join(lines[:max_lines])


def _auto_font_size(text: str, base_size: int, width_chars: int = 20) -> int:
    line_count = max(1, len(textwrap.wrap(_clean_text(text), width=width_chars)))
    if line_count >= 3:
        return max(34, base_size - 12)
    if line_count == 2:
        return max(40, base_size - 6)
    return base_size


def _wrap_multiline(text: str, width_chars: int = 20, max_lines: int = 3) -> str:
    lines: list[str] = []
    for line in text.split("\n"):
        if not line.strip():
            continue
        lines.append(_wrap_for_width(line, width_chars=width_chars, max_lines=max_lines))
    return "\n".join(lines) if lines else text


def _use_nvenc() -> bool:
    if os.getenv("USE_NVENC") == "1":
        return True
    return shutil.which("nvidia-smi") is not None


def _build_drawtext_filter(
    text: str,
    font_size: int,
    y_expr: str,
    box_color: str,
    enable_expr: str | None = None,
) -> str:
    font_path = _get_font_path()
    parts = ["drawtext"]
    if font_path:
        safe_font = font_path.replace("\\", "\\\\").replace(":", "\\:")
        parts.append(f"fontfile='{safe_font}'")
    textfile = _write_textfile(text)
    safe_textfile = _escape_filter_path(textfile)
    parts.append(f"textfile='{safe_textfile}'")
    parts.append("fontcolor=white")
    parts.append(f"fontsize={font_size}")
    parts.append("box=1")
    parts.append(f"boxcolor={box_color}")
    parts.append("boxborderw=12")
    parts.append("x=(w-text_w)/2")
    parts.append(f"y={y_expr}")
    parts.append("line_spacing=6")
    if enable_expr:
        parts.append(f"enable='{enable_expr}'")
    return (
        "drawtext=" + ":".join(parts[1:]) if len(parts) > 1 else "drawtext"
    )


def _render_with_ffmpeg(
    input_path: Path,
    output_path: Path,
    top_text: str,
    bottom_text: str,
) -> Path:
    scale_filter = (
        "scale=720:1280:force_original_aspect_ratio=decrease,"
        "pad=720:1280:(ow-iw)/2:(oh-ih)/2"
    )
    filters: list[str] = []
    if top_text.strip():
        normalized_top = _wrap_multiline(top_text, width_chars=20, max_lines=3)
        top_font = _auto_font_size(normalized_top, 52, width_chars=20)
        filters.append(
            _build_drawtext_filter(
                normalized_top,
                font_size=top_font,
                y_expr="40",
                box_color="black@0.55",
            )
        )
    if bottom_text.strip():
        normalized_bottom = _wrap_multiline(
            bottom_text, width_chars=20, max_lines=3
        )
        bottom_font = _auto_font_size(normalized_bottom, 56, width_chars=20)
        filters.append(
            _build_drawtext_filter(
                normalized_bottom,
                font_size=bottom_font,
                y_expr="h-210",
                box_color="orange@0.45",
            )
        )
    duration = _get_video_duration(input_path)
    end_start = max(0.0, duration - 1.5)
    end_filter = _build_drawtext_filter(
        _wrap_for_width("구매 링크는 댓글 확인!", width_chars=20),
        font_size=64,
        y_expr="(h-text_h)/2",
        box_color="black@0.6",
        enable_expr=f"gte(t\\,{end_start:.2f})",
    )
    filters.append(end_filter)
    video_filter = ",".join([scale_filter, *filters])

    bgm_path = _pick_bgm_path()
    use_nvenc = _use_nvenc()
    codec = "h264_nvenc" if use_nvenc else "libx264"
    preset = "p4" if use_nvenc else "ultrafast"
    has_audio = _has_audio_stream(input_path)

    def _build_cmd(filter_value: str) -> list[str]:
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(input_path),
        ]
        if bgm_path:
            cmd += ["-stream_loop", "-1", "-i", str(bgm_path)]

        if bgm_path and has_audio:
            filter_complex = (
                f"[0:v]{filter_value}[v];"
                "[1:a]volume=0.3[a1];"
                "[0:a][a1]amix=inputs=2:duration=shortest:dropout_transition=2[a]"
            )
            cmd += [
                "-filter_complex",
                filter_complex,
                "-map",
                "[v]",
                "-map",
                "[a]",
                "-shortest",
            ]
        elif bgm_path:
            filter_complex = f"[0:v]{filter_value}[v];[1:a]volume=0.3[a]"
            cmd += [
                "-filter_complex",
                filter_complex,
                "-map",
                "[v]",
                "-map",
                "[a]",
                "-shortest",
            ]
        else:
            cmd += ["-vf", filter_value]

        cmd += [
            "-c:v",
            codec,
            "-preset",
            preset,
            "-threads",
            "4",
            "-c:a",
            "aac",
            str(output_path),
        ]
        return cmd

    cmd = _build_cmd(video_filter)
    result = subprocess.run(cmd, capture_output=True, check=False)
    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="ignore") if result.stderr else ""
        lowered = stderr.lower()
        if "subtitle filter failed" in lowered or "drawtext" in lowered:
            fallback_cmd = _build_cmd(scale_filter)
            fallback_result = subprocess.run(
                fallback_cmd, capture_output=True, check=False
            )
            if fallback_result.returncode == 0:
                print(
                    "[WARN] drawtext failed; rendered without captions for fallback."
                )
                return output_path
        raise RuntimeError(stderr.strip() or "ffmpeg failed")
    return output_path


def _has_audio_stream(input_path: Path) -> bool:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a",
                "-show_entries",
                "stream=codec_type",
                "-of",
                "csv=p=0",
                str(input_path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        return bool(result.stdout.strip())
    except Exception:
        return False


def _escape_filter_path(path: str) -> str:
    return path.replace("\\", "\\\\").replace(":", "\\:")


def _write_textfile(text: str) -> str:
    filename = f"text_{abs(hash(text))}.txt"
    path = PROCESSED_DIR / filename
    path.write_text(text, encoding="utf-8")
    return str(path)


def _get_video_duration(input_path: Path) -> float:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(input_path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        return float(result.stdout.strip() or 0)
    except Exception:
        return 0.0


def _build_output_name(product) -> str:
    title = product.title or "상품"
    safe_title = title.replace(" ", "_")
    safe_title = safe_title.replace("/", "_").replace("\\", "_")
    safe_title = safe_title.replace(":", "_").replace("*", "_")
    safe_title = safe_title.replace("?", "_").replace("\"", "_")
    safe_title = safe_title.replace("<", "_").replace(">", "_").replace("|", "_")
    return f"{safe_title}_final.mp4"


def _build_raw_name(product) -> str:
    title = product.title or "상품"
    safe_title = title.replace(" ", "_")
    safe_title = safe_title.replace("/", "_").replace("\\", "_")
    safe_title = safe_title.replace(":", "_").replace("*", "_")
    safe_title = safe_title.replace("?", "_").replace("\"", "_")
    safe_title = safe_title.replace("<", "_").replace(">", "_").replace("|", "_")
    return f"{safe_title}.mp4"


def process_stock_video(
    raw_path: Path,
    output_path: Path,
    title: str,
    price: str,
    features: list[str],
) -> Path:
    clean_title = _clean_text(title)
    title_text = _wrap_for_width(clean_title, width_chars=20, max_lines=3)
    if not price or "없음" in price or "정보" in price:
        price_text = "역대급 초특가 할인"
    else:
        price_text = _clean_text(price)
    if not features or all((not f or "없음" in f) for f in features):
        feature_text = "삶의 질 수직 상승템"
    else:
        feature_text = ", ".join([_clean_text(f) for f in features[:3]])
    info_lines = [
        title_text,
        _wrap_for_width(f"가격: {price_text}", width_chars=20, max_lines=3),
        _wrap_for_width(f"특징: {feature_text}", width_chars=20, max_lines=3),
    ]
    top_text = "\n".join([line for line in info_lines if line.strip()])
    bottom_text = _wrap_for_width(_pick_cta_text(), width_chars=20, max_lines=3)
    return _render_with_ffmpeg(raw_path, output_path, top_text, bottom_text)


def process_downloaded(
    limit: int | None = None,
    track: str | None = None,
    product_ids: set[str] | None = None,
) -> list[Path]:
    manager = DatabaseManager()
    products = manager.get_products_by_status("DOWNLOADED")
    if track:
        products = [item for item in products if item.track == track]
    if product_ids:
        products = [item for item in products if str(item.id) in product_ids]
    products.sort(key=lambda item: 0 if item.track == "MANUAL" else 1)
    if limit is not None:
        products = products[:limit]

    processed: list[Path] = []
    for product in products:
        raw_path = RAW_DIR / _build_raw_name(product)
        if not raw_path.exists():
            continue

        output_path = PROCESSED_DIR / _build_output_name(product)
        title = _clean_text(product.title or "상품 정보")
        channel_id = None
        channel_settings: Channel | None = None
        with manager._session() as session:
            existing = session.scalars(
                select(VideoAsset)
                .where(VideoAsset.product_id == product.id)
                .order_by(VideoAsset.created_at.desc())
                .limit(1)
            ).first()
            if existing and existing.channel_id:
                channel_id = existing.channel_id
                channel_settings = session.get(Channel, channel_id)
            else:
                env_channel = os.getenv("DEFAULT_CHANNEL_ID")
                if env_channel:
                    channel_id = env_channel
                    channel_settings = session.get(Channel, env_channel)

        subtitle_style = (
            channel_settings.subtitle_style if channel_settings else "BOTH"
        )
        tone = channel_settings.tone if channel_settings else "INFORMAL"
        title_prefix = channel_settings.title_prefix if channel_settings else None
        hashtag_template = (
            channel_settings.hashtag_template if channel_settings else None
        )

        if title_prefix:
            title = f"{_clean_text(title_prefix)} {title}".strip()

        top_text = _wrap_for_width(title, width_chars=20, max_lines=3)
        bottom_text = _pick_cta_text_by_tone(tone)
        if hashtag_template:
            template = _clean_text(hashtag_template)
            if "{title}" in template:
                template = template.replace("{title}", _clean_text(title))
            bottom_text = f"{bottom_text}\n{template}"

        style = (subtitle_style or "BOTH").upper()
        if style == "TOP":
            bottom_text = ""
        elif style == "BOTTOM":
            top_text = ""

        _render_with_ffmpeg(raw_path, output_path, top_text, bottom_text)

        manager.update_product_status_by_id(product.id, "PROCESSED")
        manager.upsert_video_asset(
            product_id=product.id,
            source_url=product.origin_url,
            channel_id=channel_id,
            raw_path=str(raw_path),
            processed_path=str(output_path),
            status=PipelineStatus.PROCESSED,
        )
        if os.getenv("DELETE_RAW_AFTER_PROCESS") == "1":
            raw_path.unlink(missing_ok=True)
        print(f"PROCESSED {product.origin_url} -> {output_path}")
        processed.append(output_path)

    return processed


def main() -> None:
    process_downloaded()


if __name__ == "__main__":
    main()
