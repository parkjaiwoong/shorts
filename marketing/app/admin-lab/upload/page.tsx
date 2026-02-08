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
  result: "SUCCESS" | "FAILED" | "LIMIT_REACHED";
  error?: string;
};

type ClientItem = {
  id: string;
  name: string;
  phone: string;
  location: string;
  default_cta: string;
};

type ProcessedVideo = {
  id: string;
  client_id: string;
  raw_filename: string;
  processed_path: string;
  caption: string;
  status: string;
  error_message: string;
  created_at: string;
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
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [processedVideos, setProcessedVideos] = useState<ProcessedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [runningClientId, setRunningClientId] = useState<string | null>(null);
  const [period, setPeriod] = useState<"TODAY" | "WEEK">("WEEK");
  const [excludeLimitReached, setExcludeLimitReached] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const statusData = await fetchJson<{ ok: boolean } & UploadStatus>(
        "/api/admin/upload/status"
      );
      const logsData = await fetchJson<{ ok: boolean; logs: UploadLog[] }>(
        "/api/admin/upload/logs?limit=20"
      );
      const clientsData = await fetchJson<{ clients?: ClientItem[] }>(
        "/api/admin/clients"
      );
      const processedData = await fetchJson<{ items?: ProcessedVideo[] }>(
        "/api/admin/videos/processed"
      );
      setStatus(statusData);
      setLogs(logsData.logs);
      setClients(clientsData.clients ?? []);
      setProcessedVideos(processedData.items ?? []);
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

  const handleRunCustomer = async (clientId: string) => {
    setIsRunning(true);
    setRunningClientId(clientId);
    setActionMessage("");
    try {
      const response = await fetch("/api/admin/upload/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: clientId })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "실행 실패");
      }
      setActionMessage("선택한 고객 업로드 워커가 실행되었습니다.");
      await loadData();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "실행 실패");
    } finally {
      setIsRunning(false);
      setRunningClientId(null);
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

  const successFileNames = new Set(
    logs
      .filter((log) => log.result === "SUCCESS")
      .map((log) => log.filename)
  );
  const processedOnly = processedVideos.filter((video) => video.status === "PROCESSED");
  const failedOnly = processedVideos.filter((video) => video.status === "FAILED");
  const clientMap = new Map(clients.map((client) => [client.id, client]));
  const grouped = processedOnly.reduce<Record<string, ProcessedVideo[]>>(
    (acc, video) => {
      acc[video.client_id] = acc[video.client_id] || [];
      acc[video.client_id].push(video);
      return acc;
    },
    {}
  );
  const failedGrouped = failedOnly.reduce<Record<string, ProcessedVideo[]>>(
    (acc, video) => {
      acc[video.client_id] = acc[video.client_id] || [];
      acc[video.client_id].push(video);
      return acc;
    },
    {}
  );

  const logsByClient = logs.reduce<Record<string, UploadLog[]>>((acc, log) => {
    const matched = processedVideos.find((video) => {
      if (!video.processed_path) return false;
      const fileName = video.processed_path.split(/[\\/]/).pop() || "";
      return fileName === log.filename;
    });
    if (!matched) return acc;
    acc[matched.client_id] = acc[matched.client_id] || [];
    acc[matched.client_id].push(log);
    return acc;
  }, {});

  const isInPeriod = (timestamp: string) => {
    const time = new Date(timestamp).getTime();
    if (Number.isNaN(time)) return false;
    const now = new Date();
    if (period === "TODAY") {
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      ).getTime();
      return time >= start;
    }
    const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    return time >= weekAgo;
  };

  const buildStats = (clientId: string) => {
    let entries = (logsByClient[clientId] ?? []).filter((log) =>
      isInPeriod(log.timestamp)
    );
    if (excludeLimitReached) {
      entries = entries.filter((log) => log.result !== "LIMIT_REACHED");
    }
    const success = entries.filter((log) => log.result === "SUCCESS").length;
    const failed = entries.filter((log) => log.result === "FAILED").length;
    const limitReached = entries.filter((log) => log.result === "LIMIT_REACHED").length;
    const total = success + failed;
    const rate = total > 0 ? Math.round((success / total) * 100) : 0;
    return { success, failed, limitReached, rate };
  };

  const summaryStats = (() => {
    let entries = logs.filter((log) => isInPeriod(log.timestamp));
    if (excludeLimitReached) {
      entries = entries.filter((log) => log.result !== "LIMIT_REACHED");
    }
    const success = entries.filter((log) => log.result === "SUCCESS").length;
    const failed = entries.filter((log) => log.result === "FAILED").length;
    const limitReached = entries.filter((log) => log.result === "LIMIT_REACHED").length;
    const total = success + failed;
    const rate = total > 0 ? Math.round((success / total) * 100) : 0;
    return { success, failed, limitReached, rate };
  })();

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
          <p>가공 완료된 영상만 고객 단위로 업로드합니다.</p>
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
        <div style={{ fontWeight: 600, marginBottom: 8 }}>기간 필터</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={`btn ${period === "TODAY" ? "primary" : ""}`}
            onClick={() => setPeriod("TODAY")}
          >
            오늘
          </button>
          <button
            className={`btn ${period === "WEEK" ? "primary" : ""}`}
            onClick={() => setPeriod("WEEK")}
          >
            최근 7일
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={excludeLimitReached}
              onChange={(event) => setExcludeLimitReached(event.target.checked)}
            />
            LIMIT_REACHED 제외
          </label>
        </div>
      </div>

      <div className="lab-card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>전체 합계</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div
            style={{
              fontSize: 12,
              padding: "2px 8px",
              borderRadius: 999,
              background: "#ecfeff",
              color: "#0e7490"
            }}
          >
            성공 {summaryStats.success}
          </div>
          <div
            style={{
              fontSize: 12,
              padding: "2px 8px",
              borderRadius: 999,
              background: "#fef2f2",
              color: "#b91c1c"
            }}
          >
            실패 {summaryStats.failed}
          </div>
          <div
            style={{
              fontSize: 12,
              padding: "2px 8px",
              borderRadius: 999,
              background: "#fff7ed",
              color: "#c2410c"
            }}
          >
            LIMIT {summaryStats.limitReached}
          </div>
          <div
            style={{
              fontSize: 12,
              padding: "2px 8px",
              borderRadius: 999,
              background: "#f0fdf4",
              color: "#15803d"
            }}
          >
            성공률 {summaryStats.rate}%
          </div>
        </div>
      </div>
      <div className="lab-card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>가공 완료 영상</div>
        {loading ? (
          <div>로딩 중...</div>
        ) : processedOnly.length === 0 ? (
          <div>가공 완료된 영상이 없습니다.</div>
        ) : (
          Object.entries(grouped).map(([clientId, items]) => {
            const client = clientMap.get(clientId);
            const stats = buildStats(clientId);
            return (
              <div key={clientId} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ fontWeight: 600 }}>
                    {client?.name || "알 수 없는 고객"} · {items.length}건
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#ecfeff",
                      color: "#0e7490"
                    }}
                  >
                    성공 {stats.success}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#fef2f2",
                      color: "#b91c1c"
                    }}
                  >
                    실패 {stats.failed}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#f0fdf4",
                      color: "#15803d"
                    }}
                  >
                    성공률 {stats.rate}%
                  </div>
                  <button
                    className="btn small primary"
                    onClick={() => handleRunCustomer(clientId)}
                    disabled={
                      isRunning ||
                      running ||
                      runningClientId === clientId ||
                      items.length === 0
                    }
                  >
                    {runningClientId === clientId ? "실행 중..." : "고객 업로드 실행"}
                  </button>
                </div>
                <div className="lab-log-list" style={{ marginTop: 6 }}>
                  {items.map((item) => (
                    <div key={item.id} className="lab-log-row">
                      <div className="lab-log-main">
                        <div className="lab-log-title">{item.raw_filename}</div>
                        <div className="lab-log-time">
                          생성: {item.created_at.replace("T", " ").slice(0, 16)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {logsByClient[clientId]?.length ? (
                  <div
                    style={{
                      marginTop: 8,
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      fontSize: 12
                    }}
                  >
                    {logsByClient[clientId].map((log, index) => (
                      <div
                        key={`${clientId}-${log.timestamp}-${index}`}
                        style={{ padding: "4px 0", color: getLogColor(log) }}
                      >
                        {log.timestamp} | {log.filename} | {log.attempt}회 | {log.result}
                        {log.error ? ` | ${log.error}` : ""}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="lab-card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>가공 실패 영상</div>
        {loading ? (
          <div>로딩 중...</div>
        ) : failedOnly.length === 0 ? (
          <div>가공 실패한 영상이 없습니다.</div>
        ) : (
          Object.entries(failedGrouped).map(([clientId, items]) => {
            const client = clientMap.get(clientId);
            const stats = buildStats(clientId);
            return (
              <div key={`failed-${clientId}`} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600 }}>
                  {client?.name || "알 수 없는 고객"} · {items.length}건
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <div
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#ecfeff",
                      color: "#0e7490"
                    }}
                  >
                    성공 {stats.success}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#fef2f2",
                      color: "#b91c1c"
                    }}
                  >
                    실패 {stats.failed}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#f0fdf4",
                      color: "#15803d"
                    }}
                  >
                    성공률 {stats.rate}%
                  </div>
                </div>
                <div className="lab-log-list" style={{ marginTop: 6 }}>
                  {items.map((item) => (
                    <div key={item.id} className="lab-log-row">
                      <div className="lab-log-main">
                        <div className="lab-log-title">{item.raw_filename}</div>
                        <div className="lab-log-time">
                          실패: {item.created_at.replace("T", " ").slice(0, 16)}
                        </div>
                        {item.error_message ? (
                          <div className="lab-helper warning">{item.error_message}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
