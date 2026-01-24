from datetime import datetime, timedelta

import streamlit as st
from sqlalchemy import func, select

from db_manager import DatabaseManager
from models import Channel, PipelineStatus, UploadLog, UploadStatus, VideoAsset
from upload_manager import run_uploads


st.set_page_config(page_title="채널 운영 대시보드", layout="wide")
st.title("채널 운영 대시보드")

manager = DatabaseManager()
tabs = st.tabs(["채널 관리", "업로드 대기 영상", "업로드 로그", "채널 운영 관리"])


def _today_range() -> tuple[datetime, datetime]:
    now = datetime.utcnow()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, now


def _get_today_upload_count(session, channel: Channel) -> int:
    start, end = _today_range()
    stmt = (
        select(func.count())
        .select_from(UploadLog)
        .join(VideoAsset, UploadLog.video_asset_id == VideoAsset.id)
        .where(VideoAsset.channel_id == channel.id)
        .where(UploadLog.status == UploadStatus.SUCCESS)
        .where(UploadLog.created_at >= start)
        .where(UploadLog.created_at <= end)
    )
    return int(session.scalar(stmt) or 0)


def _get_last_upload_time(session, channel: Channel) -> datetime | None:
    stmt = (
        select(UploadLog.created_at)
        .join(VideoAsset, UploadLog.video_asset_id == VideoAsset.id)
        .where(VideoAsset.channel_id == channel.id)
        .where(UploadLog.status == UploadStatus.SUCCESS)
        .order_by(UploadLog.created_at.desc())
        .limit(1)
    )
    return session.scalar(stmt)


def _build_rule_preview(channel: Channel | None, title: str) -> tuple[str, str]:
    if not channel:
        return title, ""
    prefix = channel.title_prefix or ""
    full_title = f"{prefix} {title}".strip() if prefix else title
    hashtag = channel.hashtag_template or ""
    if "{title}" in hashtag:
        hashtag = hashtag.replace("{title}", full_title)
    return full_title, hashtag


def _render_dashboard_card(label: str, value: int, color: str) -> None:
    st.markdown(
        f"""
        <div style="border:1px solid #e6e6e6;padding:16px;border-radius:12px;">
          <div style="font-size:14px;color:#7a7a7a;">{label}</div>
          <div style="font-size:32px;font-weight:700;color:{color};">{value}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


start_today, end_today = _today_range()
with manager._session() as session:
    total_channels = int(session.scalar(select(func.count()).select_from(Channel)) or 0)
    today_upload_success = int(
        session.scalar(
            select(func.count())
            .select_from(UploadLog)
            .where(UploadLog.status == UploadStatus.SUCCESS)
            .where(UploadLog.created_at >= start_today)
            .where(UploadLog.created_at <= end_today)
        )
        or 0
    )
    processed_pending = int(
        session.scalar(
            select(func.count())
            .select_from(VideoAsset)
            .where(VideoAsset.status == PipelineStatus.PROCESSED)
        )
        or 0
    )
    today_upload_failed = int(
        session.scalar(
            select(func.count())
            .select_from(UploadLog)
            .where(UploadLog.status == UploadStatus.FAILED)
            .where(UploadLog.created_at >= start_today)
            .where(UploadLog.created_at <= end_today)
        )
        or 0
    )

st.subheader("요약 대시보드")
col1, col2, col3, col4 = st.columns(4)
with col1:
    _render_dashboard_card("전체 채널 수", total_channels, "#1f77b4")
with col2:
    _render_dashboard_card("오늘 업로드 완료 수", today_upload_success, "#2ca02c")
with col3:
    _render_dashboard_card("업로드 대기(PROCESSED)", processed_pending, "#1f77b4")
with col4:
    _render_dashboard_card("업로드 실패(오늘)", today_upload_failed, "#d62728")

with tabs[0]:
    st.subheader("채널 생성")
    with st.form("create_channel"):
        channel_name = st.text_input("채널명")
        platform = st.selectbox("플랫폼", ["YOUTUBE"])
        upload_mode = st.selectbox("업로드 모드", ["AUTO", "MANUAL"])
        daily_limit = st.number_input("일 업로드 수", min_value=0, max_value=100, value=3)
        subtitle_style = st.selectbox("자막 스타일", ["TOP", "BOTTOM", "BOTH"])
        tone = st.selectbox("톤", ["INFORMAL", "FORMAL", "SALES"])
        title_prefix = st.text_input("타이틀 프리픽스", value="")
        hashtag_template = st.text_input("해시태그 템플릿", value="")
        active = st.checkbox("활성", value=True)
        submitted = st.form_submit_button("채널 생성")
    if submitted and channel_name:
        with manager._session() as session:
            channel = Channel(
                channel_name=channel_name,
                platform=platform,
                upload_mode=upload_mode,
                daily_upload_limit=int(daily_limit),
                subtitle_style=subtitle_style,
                tone=tone,
                title_prefix=title_prefix or None,
                hashtag_template=hashtag_template or None,
                active_yn=active,
            )
            session.add(channel)
            session.commit()
        st.success("채널 생성 완료")

    st.subheader("채널 목록")
    with manager._session() as session:
        channels = session.scalars(select(Channel)).all()
        if not channels:
            st.info("등록된 채널이 없습니다.")
        for channel in channels:
            today_count = _get_today_upload_count(session, channel)
            last_upload = _get_last_upload_time(session, channel)
            ready_state = (
                "READY" if today_count < channel.daily_upload_limit else "BLOCKED"
            )
            badge = f"{today_count}/{channel.daily_upload_limit}"
            last_text = (
                last_upload.strftime("%Y-%m-%d %H:%M")
                if isinstance(last_upload, datetime)
                else "-"
            )
            col1, col2, col3, col4, col5, col6 = st.columns([3, 2, 2, 2, 3, 2])
            with col1:
                st.write(channel.channel_name)
                st.caption(f"오늘 업로드: {badge} | 마지막: {last_text} | {ready_state}")
            with col2:
                st.write(channel.platform)
            with col3:
                new_limit = st.number_input(
                    "일 업로드 수",
                    min_value=0,
                    max_value=100,
                    value=int(channel.daily_upload_limit),
                    key=f"limit_{channel.id}",
                )
            with col4:
                active_now = st.checkbox(
                    "활성",
                    value=channel.active_yn,
                    key=f"active_{channel.id}",
                )
            with col5:
                subtitle_style = st.selectbox(
                    "자막 스타일",
                    ["TOP", "BOTTOM", "BOTH"],
                    index=["TOP", "BOTTOM", "BOTH"].index(channel.subtitle_style),
                    key=f"subtitle_{channel.id}",
                )
                tone = st.selectbox(
                    "톤",
                    ["INFORMAL", "FORMAL", "SALES"],
                    index=["INFORMAL", "FORMAL", "SALES"].index(channel.tone),
                    key=f"tone_{channel.id}",
                )
                title_prefix = st.text_input(
                    "타이틀 프리픽스",
                    value=channel.title_prefix or "",
                    key=f"prefix_{channel.id}",
                )
                hashtag_template = st.text_input(
                    "해시태그 템플릿",
                    value=channel.hashtag_template or "",
                    key=f"hashtag_{channel.id}",
                )
            with col6:
                if st.button("저장", key=f"save_{channel.id}"):
                    channel.daily_upload_limit = int(new_limit)
                    channel.active_yn = active_now
                    channel.subtitle_style = subtitle_style
                    channel.tone = tone
                    channel.title_prefix = title_prefix or None
                    channel.hashtag_template = hashtag_template or None
                    session.add(channel)
                    session.commit()
                    st.success("저장 완료")

with tabs[1]:
    st.subheader("PROCESSED 영상")
    with manager._session() as session:
        channels = session.scalars(select(Channel)).all()
        channel_options = {f"{c.channel_name} ({c.platform})": c.id for c in channels}
        channel_options["전체"] = None
        selected_label = st.selectbox("채널 필터", list(channel_options.keys()))
        selected_channel_id = channel_options[selected_label]

        stmt = select(VideoAsset).where(VideoAsset.status == PipelineStatus.PROCESSED)
        if selected_channel_id:
            stmt = stmt.where(VideoAsset.channel_id == selected_channel_id)
        videos = session.scalars(stmt).all()

        if not videos:
            st.info("업로드 대기 영상이 없습니다.")
        for video in videos:
            col1, col2, col3, col4, col5 = st.columns([3, 3, 3, 3, 2])
            with col1:
                st.write(video.product.title)
                st.caption(video.processed_path or "")
            with col2:
                channel_name = (
                    video.channel.channel_name if video.channel else "미지정"
                )
                st.write(channel_name)
            new_channel_id = video.channel_id
            with col3:
                if channels:
                    assign_map = {c.channel_name: c.id for c in channels}
                    assign_map["미지정"] = None
                    current = video.channel.channel_name if video.channel else "미지정"
                    new_channel_name = st.selectbox(
                        "채널 지정",
                        list(assign_map.keys()),
                        index=list(assign_map.keys()).index(current),
                        key=f"assign_{video.id}",
                    )
                    new_channel_id = assign_map[new_channel_name]
                    if st.button("적용", key=f"apply_{video.id}"):
                        video.channel_id = new_channel_id
                        session.add(video)
                        session.commit()
                        st.success("채널 지정 완료")
            with col4:
                channel_for_preview = None
                if new_channel_id:
                    channel_for_preview = next(
                        (c for c in channels if c.id == new_channel_id), None
                    )
                title_preview, hashtag_preview = _build_rule_preview(
                    channel_for_preview, video.product.title
                )
                st.write("적용 규칙 미리보기")
                st.caption(title_preview)
                if hashtag_preview:
                    st.caption(hashtag_preview)
            with col5:
                if st.button("수동 업로드", key=f"upload_{video.id}"):
                    if not video.channel_id:
                        st.warning("채널을 먼저 지정하세요.")
                    else:
                        run_uploads(channel_id=str(video.channel_id))
                        st.success("업로드 요청 완료")

with tabs[2]:
    st.subheader("업로드 로그")
    with manager._session() as session:
        logs = session.scalars(
            select(UploadLog).order_by(UploadLog.created_at.desc()).limit(200)
        ).all()
        if not logs:
            st.info("업로드 로그가 없습니다.")
        for log in logs:
            video = log.video_asset
            channel_name = (
                video.channel.channel_name if video and video.channel else "-"
            )
            status = "성공" if log.status == UploadStatus.SUCCESS else "실패"
            created = (
                log.created_at.strftime("%Y-%m-%d %H:%M")
                if isinstance(log.created_at, datetime)
                else str(log.created_at)
            )
            col1, col2, col3, col4 = st.columns([2, 2, 4, 1])
            with col1:
                st.write(created)
            with col2:
                st.write(channel_name)
            with col3:
                st.write(video.product.title if video else "-")
            with col4:
                st.write(status)

with tabs[3]:
    st.subheader("채널 운영 관리")
    left, right = st.columns([2, 1])
    with manager._session() as session:
        channels = session.scalars(select(Channel)).all()

        with left:
            st.write("채널 목록")
            if not channels:
                st.info("등록된 채널이 없습니다.")
            else:
                rows = []
                for channel in channels:
                    today_count = _get_today_upload_count(session, channel)
                    status = (
                        "READY"
                        if today_count < channel.daily_upload_limit
                        else "BLOCKED"
                    )
                    rows.append(
                        {
                            "channel_name": channel.channel_name,
                            "tone": channel.tone,
                            "subtitle_style": channel.subtitle_style,
                            "daily_upload_limit": channel.daily_upload_limit,
                            "오늘 업로드 수 / 제한": f"{today_count}/{channel.daily_upload_limit}",
                            "현재 상태": status,
                        }
                    )
                st.dataframe(rows, use_container_width=True)

            selected_name = st.selectbox(
                "채널 선택",
                [c.channel_name for c in channels] if channels else [],
            )
            selected_channel = next(
                (c for c in channels if c.channel_name == selected_name), None
            )

        with right:
            st.write("채널 설정 편집")
            if not selected_channel:
                st.info("채널을 선택하세요.")
            else:
                tone = st.selectbox(
                    "tone", ["INFORMAL", "FORMAL", "SALES"], index=["INFORMAL", "FORMAL", "SALES"].index(selected_channel.tone)
                )
                subtitle_style = st.selectbox(
                    "subtitle_style",
                    ["TOP", "BOTTOM", "BOTH"],
                    index=["TOP", "BOTTOM", "BOTH"].index(selected_channel.subtitle_style),
                )
                title_prefix = st.text_input(
                    "title_prefix", value=selected_channel.title_prefix or ""
                )
                hashtag_template = st.text_area(
                    "hashtag_template",
                    value=selected_channel.hashtag_template or "",
                    height=120,
                )
                if st.button("저장", key=f"ops_save_{selected_channel.id}"):
                    selected_channel.tone = tone
                    selected_channel.subtitle_style = subtitle_style
                    selected_channel.title_prefix = title_prefix or None
                    selected_channel.hashtag_template = hashtag_template or None
                    session.add(selected_channel)
                    session.commit()
                    st.success("저장 완료")

        st.divider()
        st.write("업로드 대기 영상 리스트")
        if not selected_channel:
            st.info("채널을 선택하면 리스트가 표시됩니다.")
        else:
            stmt = (
                select(VideoAsset)
                .where(VideoAsset.status == PipelineStatus.PROCESSED)
                .where(VideoAsset.channel_id == selected_channel.id)
                .order_by(VideoAsset.created_at.asc())
            )
            videos = session.scalars(stmt).all()
            if not videos:
                st.info("업로드 대기 영상이 없습니다.")
            else:
                today_count = _get_today_upload_count(session, selected_channel)
                can_upload = today_count < selected_channel.daily_upload_limit
                for video in videos:
                    title_preview, hashtag_preview = _build_rule_preview(
                        selected_channel, video.product.title
                    )
                    col1, col2, col3, col4 = st.columns([2, 4, 4, 2])
                    with col1:
                        st.write(str(video.id))
                    with col2:
                        st.write(title_preview)
                    with col3:
                        st.write(hashtag_preview or "-")
                    with col4:
                        st.write("READY" if can_upload else "BLOCKED")
