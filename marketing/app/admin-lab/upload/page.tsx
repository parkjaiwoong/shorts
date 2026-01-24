"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type VideoStatus = "READY" | "PROCESSED" | "UPLOADED" | "FAILED";
type UploadMode = "PRODUCTION" | "DRY_RUN";
type UploadStep = "IDLE" | "VALIDATING" | "UPLOADING" | "SUCCESS" | "FAILED";

type VideoItem = {
  id: string;
  title: string;
  duration: string;
  createdAt: string;
  status: VideoStatus;
  thumbnailUrl?: string;
  filePath?: string;
};

const MOCK_VIDEO_MAP: Record<string, VideoItem> = {
  "vid-001": {
    id: "vid-001",
    title: "A치킨_할인_쇼츠_20250101.mp4",
    duration: "00:31",
    createdAt: "2025-01-01 10:12",
    status: "READY",
    filePath: "storage/processed/A치킨_할인_쇼츠_20250101_final.mp4"
  },
  "vid-002": {
    id: "vid-002",
    title: "B치킨_리뷰_쇼츠_20250102.mp4",
    duration: "00:28",
    createdAt: "2025-01-02 14:05",
    status: "PROCESSED",
    filePath: "storage/processed/B치킨_리뷰_쇼츠_20250102_final.mp4"
  },
  "vid-003": {
    id: "vid-003",
    title: "C치킨_배달_쇼츠_20250103.mp4",
    duration: "00:34",
    createdAt: "2025-01-03 09:40",
    status: "UPLOADED",
    filePath: "storage/processed/C치킨_배달_쇼츠_20250103_final.mp4"
  },
  "vid-004": {
    id: "vid-004",
    title: "D치킨_리치텍스트_쇼츠_20250104.mp4",
    duration: "00:29",
    createdAt: "2025-01-04 11:22",
    status: "FAILED",
    filePath: "storage/processed/D치킨_리치텍스트_쇼츠_20250104_final.mp4"
  }
};

export default function AdminLabUpload() {
  const router = useRouter();
  const params = useSearchParams();
  const videoId = params.get("videoId") || "";
  const filePathParam = params.get("filePath") || "";
  const [video, setVideo] = useState<VideoItem | null>(null);
  const [platforms, setPlatforms] = useState({
    youtube: true,
    tiktok: false,
    instagram: false
  });
  const [mode, setMode] = useState<UploadMode>("PRODUCTION");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hashtags, setHashtags] = useState("#쇼츠 #추천");
  const [step, setStep] = useState<UploadStep>("IDLE");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const FAIL_LOG_STORAGE_KEY = "adminLabFailLogs";
  const FORM_STORAGE_KEY = videoId ? `adminLabUploadForm:${videoId}` : "";

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
      setVideo({
        ...found,
        filePath: filePathParam || found.filePath
      });
      setTitle(found.title.replace(".mp4", ""));
      setDescription("자동 생성 설명 텍스트");
      setHashtags("#쇼츠 #추천 #핫딜");
    } else {
      setVideo({
        id: videoId,
        title: `선택 영상 ${videoId}`,
        duration: "00:30",
        createdAt: "2025-01-01 00:00",
        status: "READY",
        filePath: filePathParam || undefined
      });
      setTitle(`선택 영상 ${videoId}`);
      setDescription("자동 생성 설명 텍스트");
      setHashtags("#쇼츠 #추천");
    }
  }, [videoId, filePathParam]);

  useEffect(() => {
    if (!FORM_STORAGE_KEY) return;
    try {
      const raw = window.sessionStorage.getItem(FORM_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        title?: string;
        description?: string;
        hashtags?: string;
        mode?: UploadMode;
        platforms?: typeof platforms;
      };
      if (saved.title) setTitle(saved.title);
      if (saved.description) setDescription(saved.description);
      if (saved.hashtags) setHashtags(saved.hashtags);
      if (saved.mode) setMode(saved.mode);
      if (saved.platforms) setPlatforms(saved.platforms);
    } catch {
      // ignore
    }
  }, [FORM_STORAGE_KEY]);

  useEffect(() => {
    if (!FORM_STORAGE_KEY) return;
    try {
      window.sessionStorage.setItem(
        FORM_STORAGE_KEY,
        JSON.stringify({
          title,
          description,
          hashtags,
          mode,
          platforms
        })
      );
    } catch {
      // ignore
    }
  }, [FORM_STORAGE_KEY, title, description, hashtags, mode, platforms]);

  useEffect(() => {
    if (step !== "UPLOADING") return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    const clickGuard = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement)?.closest("a[href]");
      if (!anchor) return;
      if (window.confirm("업로드 중입니다. 이동하시겠습니까?")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", clickGuard, true);
    return () => {
      window.removeEventListener("beforeunload", handler);
      document.removeEventListener("click", clickGuard, true);
    };
  }, [step]);

  const validate = () => {
    if (!video) {
      setError("업로드할 영상을 선택해주세요");
      return false;
    }
    if (!platforms.youtube) {
      setError("YouTube를 선택해주세요");
      return false;
    }
    if (!video.filePath) {
      setError("업로드 파일 경로가 없습니다");
      return false;
    }
    setError("");
    return true;
  };

  const appendFailLog = (errorMessage: string) => {
    try {
      const now = new Date();
      const log = {
        id: `log-${now.getTime()}`,
        title: video?.title || "Unknown",
        stage: "UPLOADING",
        platform: "YouTube",
        reason: errorMessage,
        failedAt: now.toISOString().slice(0, 16).replace("T", " "),
        status: "ACTIVE",
        errorDetail: errorMessage,
        videoId: video?.id || ""
      };
      const raw = window.localStorage.getItem(FAIL_LOG_STORAGE_KEY);
      const existing = raw ? (JSON.parse(raw) as typeof log[]) : [];
      const next = [log, ...existing];
      window.localStorage.setItem(FAIL_LOG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const parseTags = (value: string) =>
    value
      .split(/\s+/)
      .map((tag) => tag.replace("#", "").trim())
      .filter(Boolean);

  const runUpload = async (overrideMode?: UploadMode) => {
    if (!validate()) {
      setStep("FAILED");
      return;
    }
    setStep("VALIDATING");
    setMessage("업로드 준비 중...");
    await new Promise((resolve) => setTimeout(resolve, 500));

    setStep("UPLOADING");
    setMessage("플랫폼 업로드 진행 중...");
    await selectedPlatforms.reduce(async (prev) => {
      await prev;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }, Promise.resolve());

    if ((overrideMode ?? mode) === "DRY_RUN") {
      setStep("SUCCESS");
      setMessage("드라이런 테스트 완료");
      return;
    }

    try {
      setIsUploading(true);
      const response = await fetch("/api/upload/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: video?.filePath,
          title,
          description,
          tags: parseTags(hashtags),
          privacyStatus: "unlisted"
        })
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!response.ok || payload.ok === false) {
        const reason = payload.error || payload.message || "업로드 실패";
        setStep("FAILED");
        setMessage("업로드 실패");
        setError(reason);
        appendFailLog(reason);
        return;
      }
      setStep("SUCCESS");
      setMessage("YouTube 업로드 완료");
      setVideo((prev) => (prev ? { ...prev, status: "UPLOADED" } : prev));
      router.push("/admin-lab/videos");
    } catch (err) {
      const reason = err instanceof Error ? err.message : "업로드 실패";
      setStep("FAILED");
      setMessage("업로드 실패");
      setError(reason);
      appendFailLog(reason);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetry = async () => {
    setError("");
    setStep("IDLE");
    await runUpload();
  };

  return (
    <section className="lab-section">
      <div className="lab-page-header">
        <div>
          <h2>업로드 실행</h2>
          <p>선택된 영상 1건을 플랫폼에 업로드합니다.</p>
        </div>
      </div>

      <div className="lab-upload-layout">
        <div className="lab-upload-summary">
          <div className="lab-upload-card">
            <div className="lab-upload-thumb">
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
            <div className="lab-upload-body">
              <div className="lab-video-title">
                {video?.title ?? "선택된 영상 없음"}
              </div>
              <div className="lab-video-meta">
                길이 {video?.duration ?? "-"} · 생성 {video?.createdAt ?? "-"}
              </div>
              {!video ? (
                <div className="lab-helper warning">
                  업로드할 영상을 선택해주세요
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="lab-upload-grid">
          <div className="lab-upload-panel">
            <h3>플랫폼 선택</h3>
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

          <div className="lab-upload-panel">
            <h3>업로드 모드</h3>
            <div className="lab-radio-group">
              <label>
                <input
                  type="radio"
                  name="upload-mode"
                  checked={mode === "PRODUCTION"}
                  onChange={() => setMode("PRODUCTION")}
                />
                실제 업로드 (PRODUCTION)
              </label>
              <label>
                <input
                  type="radio"
                  name="upload-mode"
                  checked={mode === "DRY_RUN"}
                  onChange={() => setMode("DRY_RUN")}
                />
                테스트 업로드 (DRY_RUN)
              </label>
            </div>
          </div>

          <div className="lab-upload-panel">
            <h3>제목 / 설명 / 해시태그</h3>
            <div className="lab-form">
              <label>
                제목
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label>
                설명
                <textarea
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <label>
                해시태그
                <input
                  type="text"
                  value={hashtags}
                  onChange={(event) => setHashtags(event.target.value)}
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {error ? <div className="lab-helper warning">{error}</div> : null}
      {message ? <div className="lab-helper">{message}</div> : null}

      <div className="lab-action-row">
        <button
          className="btn primary"
          onClick={() => runUpload()}
          disabled={!platforms.youtube || step === "UPLOADING"}
        >
          업로드 실행
        </button>
        <button
          className="btn"
          onClick={() => runUpload("DRY_RUN")}
          disabled={!platforms.youtube || step === "UPLOADING"}
        >
          드라이런 테스트
        </button>
        {video?.status === "FAILED" || step === "FAILED" ? (
          <button className="btn warning" onClick={handleRetry}>
            재시도
          </button>
        ) : null}
        <button className="btn ghost" onClick={() => router.back()}>
          뒤로가기
        </button>
      </div>
    </section>
  );
}
