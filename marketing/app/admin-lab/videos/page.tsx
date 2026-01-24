"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type VideoStatus = "NEW" | "READY" | "UPLOADING" | "SUCCESS" | "FAILED";

type VideoItem = {
  id: string;
  title: string;
  duration: string;
  createdAt: string;
  status: VideoStatus;
  thumbnailUrl?: string;
  filePath?: string;
  file_path?: string;
  errorMessage?: string;
};

type ScanFile = {
  name: string;
  fullPath: string;
  size: number;
  createdAt: string;
};

const STATUS_LABEL: Record<VideoStatus, string> = {
  NEW: "NEW",
  READY: "READY",
  UPLOADING: "UPLOADING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED"
};

const formatDate = (value: string) => value.replace("T", " ").slice(0, 16);

const createVideoItem = (file: ScanFile): VideoItem => ({
  id: `import-${file.name}-${file.createdAt}`,
  title: file.name,
  duration: "-",
  createdAt: formatDate(file.createdAt),
  status: "NEW",
  filePath: file.fullPath,
  file_path: file.fullPath
});

export default function AdminLabVideos() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    setIsLoading(false);
  }, []);

  const selectedVideo = useMemo(
    () => videos.find((video) => video.id === selectedId) || null,
    [videos, selectedId]
  );

  const handleSelect = (videoId: string) => {
    setSelectedId(videoId);
    setActionMessage("");
  };

  const appendFailLog = (video: VideoItem, errorMessage: string) => {
    try {
      const now = new Date();
      const log = {
        id: `log-${now.getTime()}`,
        title: video.title,
        stage: "PROCESSING",
        platform: "YouTube",
        reason: errorMessage,
        failedAt: now.toISOString().slice(0, 16).replace("T", " "),
        status: "ACTIVE",
        errorDetail: errorMessage,
        videoId: video.id
      };
      const raw = window.localStorage.getItem("adminLabFailLogs");
      const existing = raw ? (JSON.parse(raw) as typeof log[]) : [];
      window.localStorage.setItem(
        "adminLabFailLogs",
        JSON.stringify([log, ...existing])
      );
    } catch {
      // ignore
    }
  };

  const handleValidate = async (video: VideoItem) => {
    setSelectedId(video.id);
    if (!video.filePath) {
      setActionMessage("파일 경로가 없습니다.");
      return;
    }
    setIsValidating(true);
    setActionMessage("영상 검증 중...");
    try {
      const response = await fetch("/api/admin-lab/videos/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: video.filePath })
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        title?: string;
        description?: string;
        duration?: number;
      };
      if (!response.ok || payload.ok === false) {
        const reason = payload.error || "영상 검증 실패";
        setVideos((prev) =>
          prev.map((item) =>
            item.id === video.id
              ? { ...item, status: "FAILED", errorMessage: reason }
              : item
          )
        );
        appendFailLog(video, reason);
        setActionMessage(reason);
        return;
      }
      const nextTitle = payload.title || video.title;
      const durationText =
        typeof payload.duration === "number" && payload.duration > 0
          ? `${Math.floor(payload.duration / 60)
              .toString()
              .padStart(2, "0")}:${Math.floor(payload.duration % 60)
              .toString()
              .padStart(2, "0")}`
          : video.duration;
      setVideos((prev) =>
        prev.map((item) =>
          item.id === video.id
            ? {
                ...item,
                title: nextTitle,
                duration: durationText,
                status: "READY",
                errorMessage: undefined
              }
            : item
        )
      );
      setActionMessage("검증 완료: READY 상태로 전환");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "영상 검증 실패";
      setVideos((prev) =>
        prev.map((item) =>
          item.id === video.id
            ? { ...item, status: "FAILED", errorMessage: reason }
            : item
        )
      );
      appendFailLog(video, reason);
      setActionMessage(reason);
    } finally {
      setIsValidating(false);
    }
  };

  const handleUpload = (video: VideoItem) => {
    if (!video.filePath) {
      setActionMessage("업로드 파일 경로가 없습니다");
      return;
    }
    setSelectedId(video.id);
    const params = new URLSearchParams({
      videoId: video.id,
      filePath: video.filePath
    });
    router.push(`/admin-lab/upload?${params.toString()}`);
  };

  const handleLoadNew = async () => {
    setIsLoading(true);
    setActionMessage("");
    try {
      const response = await fetch("/api/admin-lab/videos/scan", {
        cache: "no-store"
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        files?: ScanFile[];
      };
      if (!response.ok || payload.ok === false) {
        setActionMessage(payload.error || "폴더 접근 실패");
        setVideos([]);
        return;
      }
      const files = payload.files || [];
      if (files.length === 0) {
        setActionMessage("불러올 새 영상이 없습니다");
        setVideos([]);
        return;
      }
      setVideos(files.map(createVideoItem));
      setActionMessage("");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "폴더 접근 실패";
      setActionMessage(reason);
      setVideos([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="lab-section">
      <div className="lab-page-header">
        <div>
          <h2>영상 관리</h2>
          <p>업로드 가능한 영상 상태를 한눈에 확인합니다.</p>
        </div>
        <button className="btn primary" onClick={handleLoadNew}>
          새 영상 불러오기
        </button>
      </div>

      {actionMessage ? <div className="lab-helper">{actionMessage}</div> : null}

      {isLoading ? (
        <div className="lab-video-grid">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={`skeleton-${index}`} className="lab-video-card skeleton">
              <div className="lab-video-thumb skeleton-block" />
              <div className="lab-video-body">
                <div className="skeleton-line short" />
                <div className="skeleton-line" />
                <div className="skeleton-line" />
              </div>
            </div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="empty-state">불러올 새 영상이 없습니다</div>
      ) : (
        <div className="lab-video-grid">
          {videos.map((video) => (
            <button
              type="button"
              key={video.id}
              className={`lab-video-card ${
                selectedId === video.id ? "selected" : ""
              }`}
              onClick={() => handleSelect(video.id)}
            >
              <div className="lab-video-thumb">
                {video.thumbnailUrl ? (
                  <img src={video.thumbnailUrl} alt={video.title} />
                ) : (
                  <div className="lab-video-placeholder">미리보기</div>
                )}
                <span className={`lab-status-badge ${video.status.toLowerCase()}`}>
                  {STATUS_LABEL[video.status]}
                </span>
              </div>
              <div className="lab-video-body">
                <div className="lab-video-title">{video.title}</div>
                <div className="lab-video-meta">
                  길이 {video.duration} · 생성 {video.createdAt}
                </div>
                <div className="lab-video-actions">
                  {video.status === "NEW" ? (
                    <button
                      className="btn small primary"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleValidate(video);
                      }}
                      disabled={isValidating}
                    >
                      새 영상 불러오기
                    </button>
                  ) : null}
                  {video.status === "READY" ? (
                    <button
                      className="btn small primary"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleUpload(video);
                      }}
                      disabled={selectedId !== video.id}
                    >
                      업로드 실행
                    </button>
                  ) : null}
                  {video.status === "FAILED" ? (
                    <button
                      className="btn small warning"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleValidate(video);
                      }}
                      disabled={isValidating}
                    >
                      다시 불러오기
                    </button>
                  ) : null}
                  {video.status !== "NEW" &&
                  video.status !== "READY" &&
                  video.status !== "FAILED" ? (
                    <span className="lab-video-meta">처리 중</span>
                  ) : null}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
