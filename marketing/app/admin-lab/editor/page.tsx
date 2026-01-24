"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type VideoStatus = "READY" | "PROCESSED" | "UPLOADED" | "FAILED";
type ProcessStep = "IDLE" | "PROCESSING" | "PROCESSED" | "FAILED";

type VideoItem = {
  id: string;
  title: string;
  duration: string;
  createdAt: string;
  status: VideoStatus;
  thumbnailUrl?: string;
};

const MOCK_VIDEO_MAP: Record<string, VideoItem> = {
  "vid-001": {
    id: "vid-001",
    title: "A치킨_할인_쇼츠_20250101.mp4",
    duration: "00:31",
    createdAt: "2025-01-01 10:12",
    status: "READY"
  },
  "vid-002": {
    id: "vid-002",
    title: "B치킨_리뷰_쇼츠_20250102.mp4",
    duration: "00:28",
    createdAt: "2025-01-02 14:05",
    status: "PROCESSED"
  },
  "vid-003": {
    id: "vid-003",
    title: "C치킨_배달_쇼츠_20250103.mp4",
    duration: "00:34",
    createdAt: "2025-01-03 09:40",
    status: "UPLOADED"
  },
  "vid-004": {
    id: "vid-004",
    title: "D치킨_리치텍스트_쇼츠_20250104.mp4",
    duration: "00:29",
    createdAt: "2025-01-04 11:22",
    status: "FAILED"
  }
};

export default function AdminLabEditor() {
  const router = useRouter();
  const params = useSearchParams();
  const videoId = params.get("videoId") || "";
  const [video, setVideo] = useState<VideoItem | null>(null);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [captionTemplate, setCaptionTemplate] = useState("기본");
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [bgmPreset, setBgmPreset] = useState("preset_01");
  const [platforms, setPlatforms] = useState({
    youtube: true,
    tiktok: false,
    instagram: false
  });
  const [step, setStep] = useState<ProcessStep>("IDLE");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedPlatforms = useMemo(
    () =>
      Object.entries(platforms)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key),
    [platforms]
  );

  useEffect(() => {
    if (!videoId) {
      setVideo(null);
      return;
    }
    const found = MOCK_VIDEO_MAP[videoId];
    if (found) {
      setVideo(found);
    } else {
      setVideo({
        id: videoId,
        title: `선택 영상 ${videoId}`,
        duration: "00:30",
        createdAt: "2025-01-01 00:00",
        status: "READY"
      });
    }
  }, [videoId]);

  useEffect(() => {
    if (step !== "PROCESSING") return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [step]);

  const handleProcess = async () => {
    if (!video) {
      setError("가공할 영상이 없습니다");
      setStep("FAILED");
      return;
    }
    if (selectedPlatforms.length === 0) {
      setError("플랫폼을 선택해주세요");
      setStep("FAILED");
      return;
    }
    setError("");
    setMessage("가공 실행 중...");
    setStep("PROCESSING");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setStep("PROCESSED");
    setMessage("가공 완료");
    setVideo((prev) => (prev ? { ...prev, status: "PROCESSED" } : prev));
  };

  const handlePreview = () => {
    if (!video) {
      setError("가공할 영상이 없습니다");
      return;
    }
    setError("");
    setMessage("가공 결과 미리보기 (MVP)");
  };

  const handleComplete = () => {
    if (!video || step !== "PROCESSED") return;
    router.push(`/admin-lab/upload?videoId=${video.id}`);
  };

  return (
    <section className="lab-section">
      <div className="lab-page-header">
        <div>
          <h2>영상 가공</h2>
          <p>자동/프리셋 기반 가공으로 업로드 준비 상태를 만듭니다.</p>
        </div>
      </div>

      <div className="lab-edit-summary">
        <div className="lab-edit-card">
          <div className="lab-edit-thumb">
            {video?.thumbnailUrl ? (
              <img src={video.thumbnailUrl} alt={video.title} />
            ) : (
              <div className="lab-video-placeholder">미리보기</div>
            )}
            {video ? (
              <span className={`lab-status-badge ${video.status.toLowerCase()}`}>
                {video.status}
              </span>
            ) : null}
          </div>
          <div className="lab-edit-body">
            <div className="lab-video-title">
              {video?.title ?? "선택된 영상 없음"}
            </div>
            <div className="lab-video-meta">
              길이 {video?.duration ?? "-"} · 생성 {video?.createdAt ?? "-"}
            </div>
            {!video ? (
              <div className="lab-helper warning">가공할 영상이 없습니다</div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="lab-edit-layout">
        <div className="lab-edit-panel">
          <h3>자막 설정</h3>
          <div className="lab-checklist">
            <label>
              <input
                type="checkbox"
                checked={captionsEnabled}
                onChange={(event) => setCaptionsEnabled(event.target.checked)}
              />
              자막 사용
            </label>
            <label>
              자막 템플릿
              <select
                value={captionTemplate}
                onChange={(event) => setCaptionTemplate(event.target.value)}
                disabled={!captionsEnabled}
              >
                <option value="기본">기본</option>
                <option value="강조형">강조형</option>
                <option value="심플">심플</option>
              </select>
            </label>
          </div>

          <h3>배경 사운드</h3>
          <div className="lab-checklist">
            <label>
              <input
                type="checkbox"
                checked={bgmEnabled}
                onChange={(event) => setBgmEnabled(event.target.checked)}
              />
              배경음 사용
            </label>
            <label>
              사운드 프리셋
              <select
                value={bgmPreset}
                onChange={(event) => setBgmPreset(event.target.value)}
                disabled={!bgmEnabled}
              >
                <option value="none">none</option>
                <option value="preset_01">preset_01</option>
                <option value="preset_02">preset_02</option>
              </select>
            </label>
          </div>

          <h3>플랫폼 포맷 선택</h3>
          <div className="lab-checklist">
            <label>
              <input
                type="checkbox"
                checked={platforms.youtube}
                onChange={(event) =>
                  setPlatforms((prev) => ({
                    ...prev,
                    youtube: event.target.checked
                  }))
                }
              />
              YouTube Shorts
            </label>
            <label>
              <input
                type="checkbox"
                checked={platforms.tiktok}
                onChange={(event) =>
                  setPlatforms((prev) => ({
                    ...prev,
                    tiktok: event.target.checked
                  }))
                }
              />
              TikTok
            </label>
            <label>
              <input
                type="checkbox"
                checked={platforms.instagram}
                onChange={(event) =>
                  setPlatforms((prev) => ({
                    ...prev,
                    instagram: event.target.checked
                  }))
                }
              />
              Instagram Reels
            </label>
          </div>
        </div>

        <div className="lab-edit-preview">
          <div className="lab-edit-preview-inner">
            <div className="lab-video-placeholder">가공 결과 미리보기</div>
          </div>
        </div>
      </div>

      {error ? <div className="lab-helper warning">{error}</div> : null}
      {message ? <div className="lab-helper">{message}</div> : null}

      <div className="lab-action-row">
        <button
          className="btn primary"
          onClick={handleProcess}
          disabled={selectedPlatforms.length === 0 || step === "PROCESSING"}
        >
          가공 실행
        </button>
        <button className="btn" onClick={handlePreview}>
          미리보기
        </button>
        <button
          className="btn"
          onClick={handleComplete}
          disabled={step !== "PROCESSED"}
        >
          가공 완료
        </button>
        <button className="btn ghost" onClick={() => router.back()}>
          뒤로가기
        </button>
      </div>
    </section>
  );
}
