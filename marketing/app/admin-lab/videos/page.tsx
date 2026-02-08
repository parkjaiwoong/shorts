"use client";

import { useEffect, useState } from "react";

type RawVideo = {
  videoId: string;
  customerId: string;
  name: string;
  size: number;
  createdAt: string;
  status: string;
};

type ClientItem = {
  id: string;
  name: string;
};

export default function AdminLabVideos() {
  const [files, setFiles] = useState<RawVideo[]>([]);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [autoProcess, setAutoProcess] = useState(false);
  const [downloadPlatform, setDownloadPlatform] = useState<
    "youtube" | "tiktok" | "instagram"
  >("youtube");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [autoProcessDownload, setAutoProcessDownload] = useState(false);
  const [downloadVideoId, setDownloadVideoId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string>("");
  const [downloadMessage, setDownloadMessage] = useState<string>("");

  const loadFiles = async () => {
    setIsLoading(true);
    try {
      const query = customerId ? `?customerId=${customerId}` : "";
      const response = await fetch(`/api/admin/videos/raw${query}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        files?: RawVideo[];
        error?: string;
      };
      if (!response.ok || payload.ok === false) {
        setMessage(payload.error || "목록을 불러오지 못했습니다.");
        setFiles([]);
        return;
      }
      setFiles(payload.files ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "오류 발생");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadClients = async () => {
      const response = await fetch("/api/admin/clients", { cache: "no-store" });
      const payload = (await response.json()) as { clients?: ClientItem[] };
      setClients(payload.clients ?? []);
    };
    void loadClients();
    void loadFiles();
  }, []);

  useEffect(() => {
    void loadFiles();
  }, [customerId]);

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage("업로드할 파일을 선택해주세요.");
      return;
    }
    if (!customerId) {
      setMessage("고객을 선택해주세요.");
      return;
    }
    setIsUploading(true);
    setMessage("");
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("customerId", customerId);
    formData.append("autoProcess", autoProcess ? "true" : "false");
    try {
      const response = await fetch("/api/admin/videos/raw", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        autoProcess?: { ok: boolean; error?: string } | null;
      };
      if (!response.ok || payload.ok === false) {
        setMessage(payload.error || "업로드 실패");
        return;
      }
      if (payload.autoProcess && payload.autoProcess.ok === false) {
        setMessage(payload.autoProcess.error || "자동 가공 실패");
      }
      setSelectedFile(null);
      await loadFiles();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "업로드 실패");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async () => {
    if (!customerId) {
      setMessage("고객을 선택해주세요.");
      return;
    }
    if (!downloadUrl.trim()) {
      setMessage("다운로드할 URL을 입력해주세요.");
      return;
    }
    setIsDownloading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/videos/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          platform: downloadPlatform,
          url: downloadUrl.trim(),
          autoProcess: autoProcessDownload
        })
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        autoProcess?: { ok: boolean; error?: string } | null;
        videoId?: string;
      };
      if (!response.ok || payload.ok === false) {
        setMessage(payload.error || "다운로드 실패");
        return;
      }
      if (payload.videoId) {
        setDownloadVideoId(payload.videoId);
        setDownloadStatus("DOWNLOADING");
        setDownloadProgress(0);
      }
      setDownloadUrl("");
      await loadFiles();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "다운로드 실패");
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    if (!downloadVideoId) return;
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/admin/videos/download?videoId=${downloadVideoId}`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          status?: { status?: string; progress?: number | null; message?: string };
        };
        if (!alive) return;
        if (!response.ok || payload.ok === false || !payload.status) {
          return;
        }
        const status = payload.status.status || "";
        setDownloadStatus(status);
        setDownloadProgress(
          typeof payload.status.progress === "number" ? payload.status.progress : null
        );
        const message = payload.status.message || "";
        const filePath =
          typeof (payload.status as { filePath?: string }).filePath === "string"
            ? (payload.status as { filePath?: string }).filePath
            : "";
        setDownloadMessage(filePath ? `${message} | ${filePath}` : message);
        if (status === "DONE" || status === "FAILED") {
          clearInterval(timer);
          setDownloadVideoId(null);
          await loadFiles();
        }
      } catch {
        // ignore
      }
    }, 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [downloadVideoId]);

  return (
    <section className="lab-section">
      <div className="lab-page-header">
        <div>
          <h2>영상 관리</h2>
          <p>원본 영상을 업로드하고 RAW 목록을 확인합니다.</p>
        </div>
      </div>

      <div className="lab-card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>원본 영상 업로드</div>
        <div className="lab-form" style={{ maxWidth: 420 }}>
          <label>
            고객 선택 (필수)
            <select
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
            >
              <option value="">고객을 선택하세요</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ marginTop: 12 }}>
            <input
              type="checkbox"
              checked={autoProcess}
              onChange={(event) => setAutoProcess(event.target.checked)}
              style={{ marginRight: 8 }}
            />
            업로드 후 자동 가공 실행
          </label>
        </div>
        <input
          type="file"
          accept="video/mp4"
          onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
        />
        <div className="lab-action-row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={handleUpload} disabled={isUploading}>
            {isUploading ? "업로드 중..." : "업로드"}
          </button>
          <button className="btn" onClick={loadFiles} disabled={isLoading}>
            새로고침
          </button>
        </div>
        {message ? <div className="lab-helper">{message}</div> : null}
      </div>

      <div className="lab-card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>URL 다운로드</div>
        <div className="lab-form" style={{ maxWidth: 520 }}>
          <label>
            플랫폼 선택
            <select
              value={downloadPlatform}
              onChange={(event) =>
                setDownloadPlatform(
                  event.target.value as "youtube" | "tiktok" | "instagram"
                )
              }
            >
              <option value="youtube">YouTube Shorts</option>
              <option value="tiktok">TikTok</option>
              <option value="instagram">Instagram Reels</option>
            </select>
          </label>
          <label>
            영상 URL
            <input
              type="url"
              placeholder="https://..."
              value={downloadUrl}
              onChange={(event) => setDownloadUrl(event.target.value)}
            />
          </label>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginTop: 12 }}>
            <label>
              <input
                type="checkbox"
                checked={autoProcessDownload}
                onChange={(event) => setAutoProcessDownload(event.target.checked)}
                style={{ marginRight: 8 }}
              />
              다운로드 후 자동 가공 실행
            </label>
            {downloadVideoId ? (
              <div
                className="lab-helper"
                style={{ whiteSpace: "pre-wrap", maxWidth: 360 }}
              >
                진행 상태: {downloadStatus}
                {typeof downloadProgress === "number"
                  ? ` · ${downloadProgress.toFixed(1)}%`
                  : ""}
                {"\n"}
                {downloadMessage ? `메시지: ${downloadMessage}` : "메시지: -"}
              </div>
            ) : null}
          </div>
        </div>
        <div className="lab-action-row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={handleDownload} disabled={isDownloading}>
            {isDownloading ? "다운로드 중..." : "URL 다운로드"}
          </button>
        </div>
      </div>

      <div className="lab-card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>RAW 영상 목록</div>
        {isLoading ? (
          <div>로딩 중...</div>
        ) : files.length === 0 ? (
          <div>업로드된 영상이 없습니다.</div>
        ) : (
          <div className="lab-log-list">
            {files.map((file) => (
              <div key={file.videoId} className="lab-log-row">
                <div className="lab-log-main">
                  <div className="lab-log-title">{file.name}</div>
                  <div className="lab-log-reason">
                    상태: {file.status} · {Math.round(file.size / 1024 / 1024)}MB
                  </div>
                  <div className="lab-log-time">
                    등록: {file.createdAt.replace("T", " ").slice(0, 16)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
