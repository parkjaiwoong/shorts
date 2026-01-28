"use client";

import { useEffect, useState } from "react";

type UploadStatus = {
  lastRunAt: string | null;
  successCount: number;
  failedCount: number;
  totalCount: number;
  running?: boolean;
};

type UploadLog = {
  timestamp: string;
  filename: string;
  attempt: number;
  result: "SUCCESS" | "FAILED";
  error?: string;
};

const fetchJson = async <T,>(input: RequestInfo) => {
  const response = await fetch(input);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as T;
};

export default function AdminLabUploadPage() {
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [logs, setLogs] = useState<UploadLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const statusData = await fetchJson<{ ok: boolean } & UploadStatus>(
        "/api/admin/upload/status"
      );
      const logsData = await fetchJson<{ ok: boolean; logs: UploadLog[] }>(
        "/api/admin/upload/logs?limit=20"
      );
      setStatus(statusData);
      setLogs(logsData.logs);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "데이터 로드 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => {
      void loadData();
    }, 30000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const handleRun = async () => {
    setIsRunning(true);
    setActionMessage("");
    try {
      const response = await fetch("/api/admin/upload/run", { method: "POST" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "실행 실패");
      }
      setActionMessage("업로드 워커가 실행되었습니다.");
      await loadData();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "실행 실패");
    } finally {
      setIsRunning(false);
    }
  };

  const running = Boolean(status?.running);
  const lastRunLabel = status?.lastRunAt
    ? new Date(status.lastRunAt).toLocaleString()
    : "없음";

  const getLogColor = (log: UploadLog) => {
    const combined = `${log.result} ${log.error || ""}`.toLowerCase();
    if (combined.includes("failed") || combined.includes("error")) {
      return "#ef4444";
    }
    if (combined.includes("success")) {
      return "#10b981";
    }
    return "#374151";
  };

  return (
    <section className="lab-section">
      <div className="lab-card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>업로드 상태 요약</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div>
            실행 상태:{" "}
            <span style={{ color: running ? "#f97316" : "#10b981" }}>
              {running ? "실행 중" : "대기 중"}
            </span>
          </div>
          <div>마지막 실행: {lastRunLabel}</div>
          <div>
            최근 성공/실패: 성공 {status?.successCount ?? 0} / 실패{" "}
            {status?.failedCount ?? 0}
          </div>
          <div>최근 로그 합계: {status?.totalCount ?? 0}</div>
        </div>
      </div>
      <div className="lab-page-header">
        <div>
          <h2>업로드 실행</h2>
          <p>자동 업로드 상태 확인 및 수동 실행</p>
        </div>
        <button
          className="btn primary"
          onClick={handleRun}
          disabled={isRunning || running}
        >
          {isRunning ? "실행 중..." : "지금 실행"}
        </button>
      </div>

      {actionMessage && <div className="lab-helper">{actionMessage}</div>}

      <div className="lab-card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>최근 업로드 로그</div>
        {loading ? (
          <div>로딩 중...</div>
        ) : logs.length === 0 ? (
          <div>로그가 없습니다.</div>
        ) : (
          <div
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 12,
              maxHeight: 320,
              overflowY: "auto",
              whiteSpace: "pre-wrap"
            }}
          >
            {logs.map((log, index) => (
              <div
                key={`${log.timestamp}-${index}`}
                style={{ padding: "6px 0", color: getLogColor(log) }}
              >
                {log.timestamp} | {log.filename} | {log.attempt}회 | {log.result}
                {log.error ? ` | ${log.error}` : ""}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
