"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type FailStage = "PROCESSING" | "UPLOADING";
type FailPlatform = "YouTube" | "TikTok" | "Instagram";
type FailStatus = "ACTIVE" | "IGNORED";

type FailLog = {
  id: string;
  title: string;
  thumbnailUrl?: string;
  stage: FailStage;
  platform: FailPlatform;
  reason: string;
  failedAt: string;
  status: FailStatus;
  errorDetail: string;
  videoId: string;
};

const FAIL_LOG_STORAGE_KEY = "adminLabFailLogs";

export default function AdminLabLogs() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<FailLog[]>([]);
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "IGNORED">("ALL");
  const [selectedLog, setSelectedLog] = useState<FailLog | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(FAIL_LOG_STORAGE_KEY);
        const stored = raw ? (JSON.parse(raw) as FailLog[]) : [];
        setLogs(stored);
      } catch {
        setLogs([]);
      }
      setIsLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  const filteredLogs = useMemo(() => {
    if (filter === "ALL") return logs;
    return logs.filter((log) => log.status === filter);
  }, [logs, filter]);

  const handleRetry = (log: FailLog) => {
    if (log.stage === "PROCESSING") {
      router.push(`/admin-lab/editor?videoId=${log.videoId}`);
      return;
    }
    router.push(`/admin-lab/upload?videoId=${log.videoId}`);
  };

  const handleIgnore = (log: FailLog) => {
    setLogs((prev) => {
      const next = prev.map((item) =>
        item.id === log.id ? { ...item, status: "IGNORED" } : item
      );
      try {
        window.localStorage.setItem(
          FAIL_LOG_STORAGE_KEY,
          JSON.stringify(next)
        );
      } catch {
        // ignore
      }
      return next;
    });
    setActionMessage("무시 처리됨");
  };

  return (
    <section className="lab-section">
      <div className="lab-page-header">
        <div>
          <h2>실패 로그</h2>
          <p>업로드 및 가공 실패 원인을 확인합니다.</p>
        </div>
      </div>

      <div className="lab-filter-row">
        <div className="lab-filter-group">
          <button
            className={filter === "ALL" ? "tab active" : "tab"}
            onClick={() => setFilter("ALL")}
          >
            전체
          </button>
          <button
            className={filter === "ACTIVE" ? "tab active" : "tab"}
            onClick={() => setFilter("ACTIVE")}
          >
            ACTIVE
          </button>
          <button
            className={filter === "IGNORED" ? "tab active" : "tab"}
            onClick={() => setFilter("IGNORED")}
          >
            IGNORED
          </button>
        </div>
        {actionMessage ? <div className="lab-helper">{actionMessage}</div> : null}
      </div>

      {isLoading ? (
        <div className="lab-log-list">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={`log-skeleton-${index}`} className="lab-log-row skeleton">
              <div className="lab-log-thumb skeleton-block" />
              <div className="lab-log-info">
                <div className="skeleton-line short" />
                <div className="skeleton-line" />
              </div>
              <div className="lab-log-meta">
                <div className="skeleton-line short" />
              </div>
              <div className="lab-log-actions">
                <div className="skeleton-line short" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="empty-state">실패한 작업이 없습니다</div>
      ) : (
        <div className="lab-log-list">
          <div className="lab-log-header">
            <span>영상</span>
            <span>실패 단계</span>
            <span>플랫폼</span>
            <span>실패 사유</span>
            <span>실패 시간</span>
            <span>액션</span>
          </div>
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              className={`lab-log-row ${log.status === "IGNORED" ? "ignored" : ""}`}
            >
              <div className="lab-log-main">
                <div className="lab-log-thumb">
                  {log.thumbnailUrl ? (
                    <img src={log.thumbnailUrl} alt={log.title} />
                  ) : (
                    <div className="lab-video-placeholder">썸네일</div>
                  )}
                </div>
                <div className="lab-log-title">{log.title}</div>
              </div>
              <div className="lab-log-pill">{log.stage}</div>
              <div className="lab-log-pill">{log.platform}</div>
              <div className="lab-log-reason">{log.reason}</div>
              <div className="lab-log-time">{log.failedAt}</div>
              <div className="lab-log-actions">
                <button className="btn small" onClick={() => setSelectedLog(log)}>
                  상세 보기
                </button>
                <button className="btn small primary" onClick={() => handleRetry(log)}>
                  재시도
                </button>
                {log.status === "ACTIVE" ? (
                  <button className="btn small warning" onClick={() => handleIgnore(log)}>
                    무시 처리
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedLog ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>상세 오류</h3>
            <div className="lab-log-detail">{selectedLog.errorDetail}</div>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setSelectedLog(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
