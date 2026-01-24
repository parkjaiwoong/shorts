"use client";

import { useMemo, useState } from "react";

type LabStatus = "WAITING" | "PROCESSING" | "READY" | "UPLOADING" | "FAILED" | "UPLOADED";

type LabVideo = {
  id: string;
  brand: string;
  status: LabStatus;
  error?: string;
};

const STATUS_META: Record<LabStatus, { label: string; tone: string; icon: string }> = {
  WAITING: { label: "업로드 대기", tone: "waiting", icon: "⏳" },
  PROCESSING: { label: "영상 처리 중", tone: "processing", icon: "⚙️" },
  READY: { label: "업로드 준비됨", tone: "ready", icon: "✅" },
  UPLOADING: { label: "업로드 진행 중", tone: "uploading", icon: "⬆️" },
  FAILED: { label: "업로드 실패", tone: "failed", icon: "❌" },
  UPLOADED: { label: "업로드 완료", tone: "uploaded", icon: "✔️" }
};

const DEFAULT_VIDEOS: LabVideo[] = [
  { id: "lab-001", brand: "A치킨", status: "READY" },
  { id: "lab-002", brand: "B치킨", status: "FAILED", error: "인증 오류" },
  { id: "lab-003", brand: "C치킨", status: "UPLOADING" }
];

export default function AdminLabDashboard() {
  const [videos] = useState<LabVideo[]>(DEFAULT_VIDEOS);

  const summary = useMemo(() => {
    return {
      success: videos.filter((item) => item.status === "UPLOADED").length,
      processing: videos.filter((item) => item.status === "PROCESSING").length,
      failed: videos.filter((item) => item.status === "FAILED").length
    };
  }, [videos]);

  return (
    <section className="lab-section">
      <div className="lab-strip">
        <div className="lab-strip-item">
          <span>오늘 업로드 건수</span>
          <strong>{summary.success}</strong>
        </div>
        <div className="lab-strip-item">
          <span>처리 중 건수</span>
          <strong>{summary.processing}</strong>
        </div>
        <div className="lab-strip-item">
          <span>업로드 실패 건수</span>
          <strong>{summary.failed}</strong>
        </div>
      </div>

      <div className="lab-actions">
        <button className="btn primary">업로드 실행</button>
        <button className="btn">영상 등록</button>
        <button className="btn ghost">기본 설정</button>
      </div>

      <div className="lab-card-list">
        {videos.map((video) => {
          const meta = STATUS_META[video.status];
          return (
            <div key={video.id} className={`lab-card ${meta.tone}`}>
              <div className="lab-thumb" />
              <div className="lab-info">
                <div className="lab-brand">{video.brand}</div>
                <div className={`lab-status ${meta.tone}`}>
                  <span className="status-icon">{meta.icon}</span>
                  {meta.label}
                </div>
                {video.status === "FAILED" && video.error ? (
                  <div className="lab-error">{video.error}</div>
                ) : null}
              </div>
              <div className="lab-buttons">
                {video.status === "WAITING" || video.status === "READY" ? (
                  <button className="btn small">▶ 업로드</button>
                ) : null}
                {video.status === "FAILED" ? (
                  <button className="btn small warning">🔁 재시도</button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
