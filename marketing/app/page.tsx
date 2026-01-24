"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SummaryMetrics = {
  today_upload_success: number;
  processed_pending: number;
  today_upload_failed: number;
};

type VideoStatus =
  | "WAITING"
  | "PROCESSING"
  | "READY"
  | "UPLOADING"
  | "FAILED"
  | "UPLOADED";

type VideoItem = {
  id: string;
  brand: string;
  status: VideoStatus;
  failureReason?: string;
  thumbnailUrl?: string;
  filePath?: string;
};

type RegisterForm = {
  brand: string;
  filePath: string;
  subtitleStyle: string;
};

type SettingsForm = {
  defaultChannel: string;
  uploadTime: string;
  dailyLimit: number;
  testMode: boolean;
};

const DEFAULT_SUMMARY: SummaryMetrics = {
  today_upload_success: 0,
  processed_pending: 0,
  today_upload_failed: 0
};

const BRAND_OPTIONS = [
  "브랜드 A",
  "브랜드 B",
  "브랜드 C"
];

const SUBTITLE_STYLES = ["기본", "상단 강조", "하단 강조"];

export default function HomePage() {
  const [summary, setSummary] = useState<SummaryMetrics>(DEFAULT_SUMMARY);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [registerForm, setRegisterForm] = useState<RegisterForm>({
    brand: BRAND_OPTIONS[0],
    filePath: "",
    subtitleStyle: SUBTITLE_STYLES[0]
  });
  const [settingsForm, setSettingsForm] = useState<SettingsForm>({
    defaultChannel: "기본 채널",
    uploadTime: "19:00",
    dailyLimit: 20,
    testMode: true
  });

  useEffect(() => {
    const loadSummary = async () => {
      try {
        const response = await fetch("/api/ops/summary", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as SummaryMetrics;
        setSummary(data);
      } catch {
        // ignore
      }
    };
    loadSummary();
  }, []);

  const processingCount = useMemo(
    () =>
      videos.filter((item) => item.status === "PROCESSING").length +
      videos.filter((item) => item.status === "UPLOADING").length,
    [videos]
  );

  const handleUpload = async (video?: VideoItem) => {
    const target =
      video ??
      videos.find(
        (item) => item.status === "READY" || item.status === "WAITING"
      );
    if (!target) {
      setActionMessage("업로드 대상이 없습니다.");
      return;
    }

    setIsUploading(true);
    setActionMessage("업로드 실행 중...");
    setVideos((prev) =>
      prev.map((item) =>
        item.id === target.id ? { ...item, status: "UPLOADING" } : item
      )
    );

    try {
      const response = await fetch("/api/upload/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: target.filePath || undefined
        })
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };

      if (!response.ok || payload.ok === false) {
        const reason = payload.error || payload.message || "업로드 실패";
        setActionMessage(`업로드 실패: ${reason}`);
        setVideos((prev) =>
          prev.map((item) =>
            item.id === target.id
              ? { ...item, status: "FAILED", failureReason: reason }
              : item
          )
        );
        return;
      }

      setActionMessage("업로드 완료");
      setVideos((prev) =>
        prev.map((item) =>
          item.id === target.id ? { ...item, status: "UPLOADED" } : item
        )
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "업로드 실패";
      setActionMessage(`업로드 실패: ${reason}`);
      setVideos((prev) =>
        prev.map((item) =>
          item.id === target.id
            ? { ...item, status: "FAILED", failureReason: reason }
            : item
        )
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetry = async (video: VideoItem) => {
    await handleUpload(video);
  };

  const handleRegister = () => {
    if (!registerForm.filePath.trim()) {
      setActionMessage("영상 파일 경로를 입력해 주세요.");
      return;
    }
    const newVideo: VideoItem = {
      id: `manual-${Date.now()}`,
      brand: registerForm.brand,
      status: "READY",
      thumbnailUrl: "",
      filePath: registerForm.filePath.trim()
    };
    setVideos((prev) => [newVideo, ...prev]);
    setActionMessage("영상이 등록되었습니다.");
    setShowRegisterModal(false);
  };

  const statusMeta = (status: VideoStatus) => {
    switch (status) {
      case "WAITING":
        return { label: "업로드 대기", icon: "⏳", tone: "waiting" };
      case "PROCESSING":
        return { label: "영상 처리 중", icon: "⚙️", tone: "processing" };
      case "READY":
        return { label: "업로드 준비됨", icon: "✅", tone: "ready" };
      case "UPLOADING":
        return { label: "업로드 진행 중", icon: "⬆️", tone: "uploading" };
      case "UPLOADED":
        return { label: "업로드 완료", icon: "✔️", tone: "uploaded" };
      case "FAILED":
        return { label: "업로드 실패", icon: "❌", tone: "failed" };
      default:
        return { label: status, icon: "•", tone: "waiting" };
    }
  };

  const friendlyError = (reason?: string) => {
    if (!reason) return "";
    const normalized = reason.toLowerCase();
    if (normalized.includes("auth") || normalized.includes("unauthorized")) {
      return "인증 오류";
    }
    if (
      normalized.includes("format") ||
      normalized.includes("codec") ||
      normalized.includes("file")
    ) {
      return "파일 형식 문제";
    }
    return "플랫폼 응답 지연";
  };

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-logo">SHOT LO PRO</div>
        <div className="admin-title">관리자 대시보드</div>
        <div className="admin-user">
          <Link className="admin-link" href="/admin">
            Admin
          </Link>
          <span>관리자: master</span>
        </div>
      </header>

      <section className="admin-strip">
        <div className="strip-item">
          <span>오늘 업로드 건수</span>
          <strong>{summary.today_upload_success}</strong>
        </div>
        <div className="strip-item">
          <span>처리 중 건수</span>
          <strong>{processingCount}</strong>
        </div>
        <div className="strip-item">
          <span>업로드 실패 건수</span>
          <strong>{summary.today_upload_failed}</strong>
        </div>
      </section>

      <section className="admin-actions">
        <button
          className="btn primary"
          onClick={() => handleUpload()}
          disabled={isUploading}
        >
          업로드 실행
        </button>
        <button className="btn" onClick={() => setShowRegisterModal(true)}>
          영상 등록
        </button>
        <button className="btn ghost" onClick={() => setShowSettingsModal(true)}>
          기본 설정
        </button>
        {actionMessage ? <span className="action-message">{actionMessage}</span> : null}
      </section>

      <section className="video-list">
        {videos.length === 0 ? (
          <div className="empty-state">등록된 영상이 없습니다.</div>
        ) : (
          <div className="video-grid">
            {videos.map((video) => (
              <div key={video.id} className="video-card">
                <div className="video-thumb">
                  {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt="thumbnail" />
                  ) : (
                    <div className="video-placeholder">Thumbnail</div>
                  )}
                </div>
                <div className="video-info">
                  <div className="video-brand">{video.brand}</div>
                  <div
                    className={`video-status ${statusMeta(video.status).tone}`}
                  >
                    <span className="status-icon">
                      {statusMeta(video.status).icon}
                    </span>
                    {statusMeta(video.status).label}
                  </div>
                  {video.status === "FAILED" && video.failureReason ? (
                    <div className="video-failure">
                      {friendlyError(video.failureReason)}
                    </div>
                  ) : null}
                </div>
                <div className="video-actions">
                  {video.status === "READY" || video.status === "WAITING" ? (
                    <button
                      className="btn small"
                      onClick={() => handleUpload(video)}
                      disabled={isUploading}
                    >
                      ▶ 업로드
                    </button>
                  ) : null}
                  {video.status === "FAILED" ? (
                    <button
                      className="btn small warning"
                      onClick={() => handleRetry(video)}
                      disabled={isUploading}
                    >
                      🔁 재시도
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showRegisterModal ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>영상 등록</h3>
            <label>
              브랜드 선택
              <select
                value={registerForm.brand}
                onChange={(event) =>
                  setRegisterForm((prev) => ({
                    ...prev,
                    brand: event.target.value
                  }))
                }
              >
                {BRAND_OPTIONS.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </label>
            <label>
              영상 파일 경로
              <input
                type="text"
                placeholder="D:\\ai\\SHOT_LO_PRO\\marketing\\storage\\imports\\test.mp4"
                value={registerForm.filePath}
                onChange={(event) =>
                  setRegisterForm((prev) => ({
                    ...prev,
                    filePath: event.target.value
                  }))
                }
              />
            </label>
            <label>
              자막 스타일
              <select
                value={registerForm.subtitleStyle}
                onChange={(event) =>
                  setRegisterForm((prev) => ({
                    ...prev,
                    subtitleStyle: event.target.value
                  }))
                }
              >
                {SUBTITLE_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {style}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button className="btn primary" onClick={handleRegister}>
                등록
              </button>
              <button className="btn ghost" onClick={() => setShowRegisterModal(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSettingsModal ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>기본 설정</h3>
            <label>
              기본 업로드 채널
              <input
                type="text"
                value={settingsForm.defaultChannel}
                onChange={(event) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    defaultChannel: event.target.value
                  }))
                }
              />
            </label>
            <label>
              업로드 시간대
              <input
                type="time"
                value={settingsForm.uploadTime}
                onChange={(event) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    uploadTime: event.target.value
                  }))
                }
              />
            </label>
            <label>
              하루 업로드 최대 수
              <input
                type="number"
                min={1}
                max={100}
                value={settingsForm.dailyLimit}
                onChange={(event) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    dailyLimit: Number(event.target.value)
                  }))
                }
              />
            </label>
            <label className="toggle-line">
              테스트 모드
              <input
                type="checkbox"
                checked={settingsForm.testMode}
                onChange={(event) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    testMode: event.target.checked
                  }))
                }
              />
            </label>
            <div className="modal-actions">
              <button
                className="btn primary"
                onClick={() => setShowSettingsModal(false)}
              >
                저장
              </button>
              <button className="btn ghost" onClick={() => setShowSettingsModal(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
