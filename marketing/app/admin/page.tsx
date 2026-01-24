"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SummaryMetrics = {
  total_channels: number;
  today_upload_success: number;
  processed_pending: number;
  today_upload_failed: number;
};

type Channel = {
  id: string;
  channel_name: string;
  tone: string | null;
  subtitle_style: string | null;
  daily_upload_limit: number;
  today_count: number;
  status: "READY" | "BLOCKED";
  title_prefix: string;
  hashtag_template: string;
  active_yn: boolean;
};

type QueueVideo = {
  video_id: string;
  title_preview: string;
  hashtag_preview: string;
  can_upload: boolean;
};

type DryRunPayload = {
  ok: boolean;
  error?: string;
  video_id?: string;
  file_path?: string;
  title?: string;
  description?: string;
  channel_id?: string | null;
  channel_name?: string | null;
};

type ChannelForm = {
  tone: string;
  subtitle_style: string;
  title_prefix: string;
  hashtag_template: string;
};

export default function AdminPage() {
  const [activeMenu, setActiveMenu] = useState<"automation" | "uploads">(
    "uploads"
  );
  const [automationView, setAutomationView] = useState<
    "partners" | "shorts" | "automation"
  >("partners");
  const [uploadTab, setUploadTab] = useState<
    "channels" | "queue" | "logs" | "settings"
  >("channels");
  const [summary, setSummary] = useState<SummaryMetrics | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [queue, setQueue] = useState<QueueVideo[]>([]);
  const [dryRun, setDryRun] = useState<DryRunPayload | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [manualLog, setManualLog] = useState("");
  const [youtubeLog, setYoutubeLog] = useState("");
  const [uploadLog, setUploadLog] = useState("");
  const [uploadJobId, setUploadJobId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isManualTest, setIsManualTest] = useState(false);
  const [isYoutubeUpload, setIsYoutubeUpload] = useState(false);
  const [progress, setProgress] = useState(0);
  const [channelForm, setChannelForm] = useState<ChannelForm>({
    tone: "",
    subtitle_style: "",
    title_prefix: "",
    hashtag_template: ""
  });

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

  const loadChannels = async () => {
    try {
      const response = await fetch("/api/ops/channels", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { channels: Channel[] };
      setChannels(data.channels || []);
      if (!selectedChannelId && data.channels?.length) {
        setSelectedChannelId(data.channels[0].id);
      }
    } catch {
      // ignore
    }
  };

  const loadQueue = async (channelId: string) => {
    if (!channelId) {
      setQueue([]);
      return;
    }
    try {
      const response = await fetch(`/api/ops/queue?channelId=${channelId}`, {
        cache: "no-store"
      });
      if (!response.ok) return;
      const data = (await response.json()) as { videos: QueueVideo[] };
      setQueue(data.videos || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void loadSummary();
    void loadChannels();
  }, []);

  useEffect(() => {
    if (selectedChannelId) {
      void loadQueue(selectedChannelId);
    }
  }, [selectedChannelId]);

  useEffect(() => {
    if (!uploadJobId) return;
    setProgress(0);
    let pct = 0;
    const timer = setInterval(() => {
      pct = Math.min(pct + 4 + Math.random() * 8, 96);
      setProgress(Math.round(pct));
    }, 900);
    return () => clearInterval(timer);
  }, [uploadJobId]);

  useEffect(() => {
    if (!uploadJobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/uploads?jobId=${uploadJobId}`, {
          cache: "no-store"
        });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { log: string; done: boolean };
        setUploadLog(data.log || "");
        if (data.done) {
          setActionMessage("업로드 완료");
          setProgress(100);
          setIsUploading(false);
          void loadSummary();
          void loadChannels();
          if (selectedChannelId) {
            void loadQueue(selectedChannelId);
          }
        }
      } catch {
        // ignore
      }
    };
    void poll();
    const timer = setInterval(poll, 1800);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [uploadJobId, selectedChannelId]);

  useEffect(() => {
    const target = channels.find((channel) => channel.id === selectedChannelId);
    if (!target) return;
    setChannelForm({
      tone: target.tone || "",
      subtitle_style: target.subtitle_style || "",
      title_prefix: target.title_prefix || "",
      hashtag_template: target.hashtag_template || ""
    });
  }, [channels, selectedChannelId]);

  const statusText = useMemo(() => {
    if (!summary) return "운영 상태를 불러오는 중입니다...";
    if (summary.today_upload_failed > 0) {
      return `조치 필요: 업로드 실패 ${summary.today_upload_failed}건 발생`;
    }
    if (summary.processed_pending > 0) {
      return `업로드 대기 중: 처리 완료 영상 ${summary.processed_pending}건`;
    }
    return "현재 상태 정상: 오늘 조치할 항목 없음";
  }, [summary]);

  const handleUpload = async () => {
    setIsUploading(true);
    setActionMessage("업로드 실행 중...");
    setUploadLog("");
    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: selectedChannelId || undefined
        })
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setActionMessage(payload.error || "업로드 실행 실패");
        setIsUploading(false);
        return;
      }
      const data = (await response.json()) as { jobId: string };
      setUploadJobId(data.jobId);
    } catch {
      setActionMessage("업로드 실행 실패");
      setIsUploading(false);
    }
  };

  const handleDryRun = async () => {
    setActionMessage("드라이런 조회 중...");
    try {
      const response = await fetch("/api/ops/dry-run", { cache: "no-store" });
      const data = (await response.json()) as DryRunPayload;
      setDryRun(data);
      if (!data.ok) {
        setActionMessage(data.error || "드라이런 실패");
      } else {
        setActionMessage("드라이런 준비 완료");
      }
    } catch {
      setActionMessage("드라이런 실패");
    }
  };

  const handleManualTest = async () => {
    setIsManualTest(true);
    setActionMessage("수동 테스트 실행 중...");
    try {
      const response = await fetch("/api/ops/manual-test", { method: "POST" });
      const payload = (await response.json()) as {
        ok: boolean;
        log?: string;
        error?: string | null;
      };
      setManualLog(payload.log || payload.error || "");
      setActionMessage(payload.ok ? "수동 테스트 완료" : "수동 테스트 실패");
      void loadSummary();
      void loadChannels();
    } catch {
      setActionMessage("수동 테스트 실패");
    } finally {
      setIsManualTest(false);
    }
  };

  const handleYoutubeUpload = async () => {
    setIsYoutubeUpload(true);
    setActionMessage("YouTube 업로드 실행 중...");
    try {
      const response = await fetch("/api/ops/youtube-upload", { method: "POST" });
      const payload = (await response.json()) as {
        ok: boolean;
        log?: string;
        error?: string | null;
      };
      setYoutubeLog(payload.log || payload.error || "");
      setActionMessage(payload.ok ? "YouTube 업로드 완료" : "YouTube 업로드 실패");
      void loadSummary();
      void loadChannels();
      if (selectedChannelId) {
        void loadQueue(selectedChannelId);
      }
    } catch {
      setActionMessage("YouTube 업로드 실패");
    } finally {
      setIsYoutubeUpload(false);
    }
  };

  const handleTestAndUpload = async () => {
    setActionMessage("테스트 생성 후 업로드 실행 중...");
    await handleManualTest();
    await handleYoutubeUpload();
  };

  const handleSaveChannel = async () => {
    if (!selectedChannelId) return;
    setActionMessage("채널 설정 저장 중...");
    try {
      const response = await fetch("/api/ops/channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: selectedChannelId,
          ...channelForm
        })
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setActionMessage(payload.error || "채널 설정 저장 실패");
        return;
      }
      setActionMessage("채널 설정 저장 완료");
      void loadChannels();
    } catch {
      setActionMessage("채널 설정 저장 실패");
    }
  };

  return (
    <div className="container">
      <div className="page-layout">
        <aside className="side-nav">
          <div className="side-title">모듈 선택</div>
          <button
            type="button"
            className={activeMenu === "automation" ? "tab active" : "tab"}
            onClick={() => setActiveMenu("automation")}
          >
            자동화 마케팅 모듈
          </button>
          <button
            type="button"
            className={activeMenu === "uploads" ? "tab active" : "tab"}
            onClick={() => setActiveMenu("uploads")}
          >
            쇼츠 자동 업로드
          </button>
        </aside>
        <div className="card content-card">
          <div className="manual-row">
            <div className="subtitle">기존 관리자 화면</div>
            <Link className="status-action" href="/admin-lab">
              신규 관리자 화면으로 이동
            </Link>
          </div>
          <h1 className="title">숏폼 수익화 자동화</h1>
          <p className="subtitle">
            자동화 마케팅과 업로드 운영을 하나의 포트에서 관리합니다.
          </p>
          {activeMenu === "automation" ? (
            <>
              <div className="menu-tabs">
                <button
                  type="button"
                  className={automationView === "partners" ? "tab active" : "tab"}
                  onClick={() => setAutomationView("partners")}
                >
                  1. 파트너스연계
                </button>
                <button
                  type="button"
                  className={automationView === "shorts" ? "tab active" : "tab"}
                  onClick={() => setAutomationView("shorts")}
                >
                  2. 일반숏츠 제작
                </button>
                <button
                  type="button"
                  className={
                    automationView === "automation" ? "tab active" : "tab"
                  }
                  onClick={() => setAutomationView("automation")}
                >
                  3. 수집자동화
                </button>
              </div>
              {automationView === "partners" ? (
                <div className="status">
                  파트너스 연계 모듈 화면입니다.
                </div>
              ) : automationView === "shorts" ? (
                <div className="status">일반 숏츠 제작 화면입니다.</div>
              ) : (
                <div className="status">수집 자동화 화면입니다.</div>
              )}
            </>
          ) : (
            <>
              <div className="dashboard-grid">
                <div className="dashboard-card">
                  <div className="dashboard-label">전체 채널 수</div>
                  <div className="dashboard-value blue">
                    {summary ? summary.total_channels : "-"}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-label">오늘 업로드 완료 수</div>
                  <div className="dashboard-value green">
                    {summary ? summary.today_upload_success : "-"}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-label">업로드 대기(PROCESSED)</div>
                  <div className="dashboard-value blue">
                    {summary ? summary.processed_pending : "-"}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-label">업로드 실패(오늘)</div>
                  <div className="dashboard-value red">
                    {summary ? summary.today_upload_failed : "-"}
                  </div>
                </div>
              </div>
              <div className="status-strip">
                <span>
                  <span className="status-icon" aria-hidden="true">
                    {summary && summary.today_upload_failed > 0 ? "⚠️" : "✅"}
                  </span>
                  {statusText}
                </span>
                <button
                  type="button"
                  className="status-action"
                  onClick={handleUpload}
                  disabled={isUploading}
                >
                  업로드 실행
                </button>
              </div>
              {actionMessage ? <div className="status">{actionMessage}</div> : null}
              <div className="manual-row">
                <select
                  value={selectedChannelId}
                  onChange={(event) => setSelectedChannelId(event.target.value)}
                >
                  <option value="">전체 채널</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.channel_name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleTestAndUpload}
                  disabled={isManualTest || isYoutubeUpload}
                >
                  테스트 생성 후 업로드
                </button>
                <button type="button" onClick={handleDryRun}>
                  테스트 업로드 (드라이런)
                </button>
                <button
                  type="button"
                  onClick={handleManualTest}
                  disabled={isManualTest}
                >
                  수동 테스트 실행
                </button>
                <button
                  type="button"
                  onClick={handleYoutubeUpload}
                  disabled={isYoutubeUpload}
                >
                  YouTube 업로드
                </button>
              </div>
              <div className="dry-run-panel">
                <div className="dry-run-grid">
                  <div>채널</div>
                  <div>{dryRun?.channel_name || "-"}</div>
                  <div>파일 경로</div>
                  <div>{dryRun?.file_path || "-"}</div>
                  <div>제목</div>
                  <div>{dryRun?.title || "-"}</div>
                  <div>해시태그</div>
                  <div>{dryRun?.description || "-"}</div>
                </div>
              </div>
              <div className="upload-progress">
                <div className="progress-label">
                  업로드 진행률 {progress}%
                </div>
                <div className="progress-channel">
                  채널:{" "}
                  {channels.find((channel) => channel.id === selectedChannelId)
                    ?.channel_name || "전체"}
                </div>
                <div className="progress-track">
                  <div
                    className="progress-bar"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <div className="screen-list">
                <button
                  type="button"
                  className={
                    uploadTab === "channels" ? "screen-card active" : "screen-card"
                  }
                  onClick={() => setUploadTab("channels")}
                >
                  <div className="screen-title">채널 관리</div>
                  <div className="screen-desc">운영 중인 채널 상태</div>
                </button>
                <button
                  type="button"
                  className={
                    uploadTab === "queue" ? "screen-card active" : "screen-card"
                  }
                  onClick={() => setUploadTab("queue")}
                >
                  <div className="screen-title">업로드 대기 영상</div>
                  <div className="screen-desc">채널별 업로드 큐</div>
                </button>
                <button
                  type="button"
                  className={
                    uploadTab === "logs" ? "screen-card active" : "screen-card"
                  }
                  onClick={() => setUploadTab("logs")}
                >
                  <div className="screen-title">업로드 로그</div>
                  <div className="screen-desc">실행 로그 확인</div>
                </button>
                <button
                  type="button"
                  className={
                    uploadTab === "settings" ? "screen-card active" : "screen-card"
                  }
                  onClick={() => setUploadTab("settings")}
                >
                  <div className="screen-title">채널 운영 관리</div>
                  <div className="screen-desc">운영 설정 업데이트</div>
                </button>
              </div>
              {uploadTab === "channels" ? (
                <div className="table">
                  <div className="table-row header">
                    <div>채널명</div>
                    <div>일일 제한</div>
                    <div>오늘 업로드</div>
                    <div>상태</div>
                    <div>톤</div>
                    <div>자막 스타일</div>
                  </div>
                  {channels.map((channel) => (
                    <div key={channel.id} className="table-row">
                      <div>{channel.channel_name}</div>
                      <div>{channel.daily_upload_limit}</div>
                      <div>{channel.today_count}</div>
                      <div>
                        <span
                          className={
                            channel.status === "READY"
                              ? "status-pill ready"
                              : "status-pill blocked"
                          }
                        >
                          {channel.status === "READY" ? "READY" : "BLOCKED"}
                        </span>
                      </div>
                      <div>{channel.tone || "-"}</div>
                      <div>{channel.subtitle_style || "-"}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              {uploadTab === "queue" ? (
                <div className="table">
                  <div className="table-row header">
                    <div>영상 제목</div>
                    <div>해시태그</div>
                    <div>업로드 가능</div>
                    <div>상태</div>
                  </div>
                  {queue.length === 0 ? (
                    <div className="status">업로드 대기 영상이 없습니다.</div>
                  ) : (
                    queue.map((item) => (
                      <div key={item.video_id} className="table-row four">
                        <div>{item.title_preview}</div>
                        <div>{item.hashtag_preview}</div>
                        <div>{item.can_upload ? "가능" : "불가"}</div>
                        <div>
                          <span
                            className={
                              item.can_upload
                                ? "status-pill ready"
                                : "status-pill blocked"
                            }
                          >
                            {item.can_upload ? "READY" : "HOLD"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
              {uploadTab === "logs" ? (
                <div className="ops-grid">
                  <div className="ops-panel">
                    <div className="ops-title">업로드 실행 로그</div>
                    <div className="log-box">{uploadLog || "로그 없음"}</div>
                  </div>
                  <div className="ops-panel">
                    <div className="ops-title">테스트/YouTube 로그</div>
                    <div className="log-box">
                      {manualLog || youtubeLog || "로그 없음"}
                    </div>
                  </div>
                </div>
              ) : null}
              {uploadTab === "settings" ? (
                <div className="form-grid">
                  <label>
                    운영 채널
                    <select
                      value={selectedChannelId}
                      onChange={(event) =>
                        setSelectedChannelId(event.target.value)
                      }
                    >
                      <option value="">채널 선택</option>
                      {channels.map((channel) => (
                        <option key={channel.id} value={channel.id}>
                          {channel.channel_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    톤
                    <input
                      type="text"
                      value={channelForm.tone}
                      onChange={(event) =>
                        setChannelForm((prev) => ({
                          ...prev,
                          tone: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label>
                    자막 스타일
                    <input
                      type="text"
                      value={channelForm.subtitle_style}
                      onChange={(event) =>
                        setChannelForm((prev) => ({
                          ...prev,
                          subtitle_style: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label>
                    제목 프리픽스
                    <input
                      type="text"
                      value={channelForm.title_prefix}
                      onChange={(event) =>
                        setChannelForm((prev) => ({
                          ...prev,
                          title_prefix: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label>
                    해시태그 템플릿
                    <textarea
                      rows={4}
                      value={channelForm.hashtag_template}
                      onChange={(event) =>
                        setChannelForm((prev) => ({
                          ...prev,
                          hashtag_template: event.target.value
                        }))
                      }
                    />
                  </label>
                  <div className="step-actions">
                    <button type="button" onClick={handleSaveChannel}>
                      채널 설정 저장
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
