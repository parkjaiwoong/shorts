"use client";

import { useEffect, useMemo, useState } from "react";

type StepState = "pending" | "running" | "done" | "error";

type StepStatus = {
  state: StepState;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
};

type RunStatus = {
  jobId: string;
  runId: string;
  topic: string;
  stage:
    | "script"
    | "images"
    | "narration"
    | "thumbnail"
    | "render"
    | "awaiting_step"
    | "awaiting_confirm"
    | "done"
    | "error";
  mode: "auto" | "step";
  waitingStep?: "script" | "images" | "narration" | "thumbnail" | "render";
  steps: {
    script: StepStatus;
    images: StepStatus;
    narration: StepStatus;
    thumbnail: StepStatus;
    render: StepStatus;
  };
  createdAt: string;
  updatedAt: string;
  confirmBeforeRender: boolean;
  geminiScript?: {
    hook: string;
    full_script: string;
    scenes: { text: string; image_prompt: string }[];
    video_title: string;
  };
  images?: string[];
  audio?: string[];
  thumbnail?: string;
  videoUrl?: string;
  error?: string;
};

export default function HomePage() {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [confirmBeforeRender, setConfirmBeforeRender] = useState(true);
  const [mode, setMode] = useState<"auto" | "step">("auto");
  const [error, setError] = useState<string | null>(null);

  const stepItems = useMemo(
    () => [
      { key: "script", label: "대본 생성" },
      { key: "images", label: "이미지 생성" },
      { key: "narration", label: "나레이션 생성" },
      { key: "thumbnail", label: "썸네일 생성" },
      { key: "render", label: "영상 합성" }
    ],
    []
  );

  const targetImageCount = runStatus?.geminiScript?.scenes?.length ?? 5;

  useEffect(() => {
    if (!runId) return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/pipeline?runId=${runId}`);
        if (!response.ok) return;
        const data = (await response.json()) as RunStatus;
        if (active) {
          setRunStatus(data);
          if (data.stage === "done" || data.stage === "error") {
            setLoading(false);
          }
        }
      } catch {
        // ignore poll errors
      }
    };
    poll();
    const timer = setInterval(poll, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [runId]);

  const runPipeline = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setRunStatus(null);
    setRunId(null);

    try {
      const response = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, confirmBeforeRender, mode })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = (await response.json()) as { runId: string };
      setRunId(data.runId);
    } catch (error) {
      setError(error instanceof Error ? error.message : "알 수 없는 오류");
      setLoading(false);
    } finally {
      // 상태는 폴링으로 업데이트
    }
  };

  const confirmRender = async () => {
    if (!runId) return;
    await fetch("/api/pipeline/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId })
    });
  };

  const nextStep = async () => {
    if (!runId) return;
    await fetch("/api/pipeline/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, action: "next" })
    });
  };

  const rerunStep = async () => {
    if (!runId || !runStatus?.waitingStep) return;
    await fetch("/api/pipeline/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, action: "rerun", step: runStatus.waitingStep })
    });
  };

  const formatDuration = (durationMs?: number) => {
    if (!durationMs) return "";
    return `${Math.round(durationMs / 100) / 10}s`;
  };

  const formatTotalDuration = (status?: RunStatus | null) => {
    if (!status?.createdAt) return "";
    const start = new Date(status.createdAt).getTime();
    const end = status.updatedAt ? new Date(status.updatedAt).getTime() : Date.now();
    const totalMs = Math.max(0, end - start);
    const totalSeconds = Math.round(totalMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}분 ${String(seconds).padStart(2, "0")}초`;
  };

  const estimateCostUsd = (status?: RunStatus | null) => {
    if (!status) return "";
    const imageCount =
      status.images?.length ??
      status.geminiScript?.scenes?.length ??
      5;
    const thumbnailCount = status.thumbnail ? 1 : 0;
    const imageCost = (imageCount + thumbnailCount) * 0.04;
    const ttsCost = 0.01;
    const total = imageCost + ttsCost;
    return `$${total.toFixed(2)} (예상)`;
  };

  return (
    <div className="container">
      <div className="card">
        <h1 className="title">AI 숏폼 자동 제작 모듈</h1>
        <p className="subtitle">
          주제만 입력하면 대본 → 이미지 → 나레이션 → 영상 합성이 자동 실행됩니다.
        </p>
        <div className="input-row">
          <input
            type="text"
            value={topic}
            placeholder="예: 10초 안에 이해하는 미니멀리즘 인테리어 팁"
            onChange={(event) => setTopic(event.target.value)}
          />
          <button onClick={runPipeline} disabled={loading}>
            {loading ? "제작 중..." : "숏폼 만들기"}
          </button>
        </div>
        <div className="toggle-group">
          <label className="toggle">
            <input
              type="radio"
              name="mode"
              value="auto"
              checked={mode === "auto"}
              onChange={() => setMode("auto")}
            />
            전체 자동 실행
          </label>
          <label className="toggle">
            <input
              type="radio"
              name="mode"
              value="step"
              checked={mode === "step"}
              onChange={() => setMode("step")}
            />
            단계별 실행
          </label>
        </div>
        {mode === "auto" && (
          <label className="toggle">
            <input
              type="checkbox"
              checked={confirmBeforeRender}
              onChange={(event) => setConfirmBeforeRender(event.target.checked)}
            />
            렌더링 전에 최종 확인하기
          </label>
        )}
        {error && <div className="status">실패: {error}</div>}
        {runStatus && (
          <div className="status">
            {stepItems.map((step) => {
              const info = runStatus.steps[step.key as keyof RunStatus["steps"]];
              const done = info.state === "done";
              const running = info.state === "running";
              return (
                <div key={step.key}>
                  {done ? "✅" : running ? "⏳" : "•"} {step.label}
                  {done && info.durationMs ? ` (${formatDuration(info.durationMs)})` : ""}
                  {step.key === "images" && runStatus.images
                    ? ` (${runStatus.images.length}/${targetImageCount})`
                    : ""}
                </div>
              );
            })}
            {runStatus.createdAt ? `\n전체 소요: ${formatTotalDuration(runStatus)}` : ""}
            {runStatus ? ` | 예상 비용: ${estimateCostUsd(runStatus)}` : ""}
            {runStatus.stage === "error" && runStatus.error
              ? `\n실패: ${runStatus.error}`
              : ""}
          </div>
        )}
        {runStatus?.geminiScript?.full_script && (
          <div className="status">
            <strong>대본</strong>
            {runStatus.runId && (
              <>
                {"\n"}
                <a href={`/runs/${runStatus.runId}/output/script.json`} target="_blank" rel="noreferrer">
                  script.json 보기
                </a>
              </>
            )}
            {"\n"}
            {runStatus.geminiScript.full_script}
          </div>
        )}
        {runStatus?.images?.length ? (
          <div className="preview-grid">
            {runStatus.images.map((image) => (
              <a key={image} href={image} target="_blank" rel="noreferrer">
                <img src={image} alt="scene" />
              </a>
            ))}
          </div>
        ) : null}
        {runStatus?.audio?.length ? (
          <div className="audio-list">
            {runStatus.audio.map((audio) => (
              <audio key={audio} controls src={audio} />
            ))}
          </div>
        ) : null}
        {runStatus?.thumbnail ? (
          <div className="thumbnail-preview">
            <strong>썸네일</strong>
            <a href={runStatus.thumbnail} target="_blank" rel="noreferrer">
              <img src={runStatus.thumbnail} alt="thumbnail" />
            </a>
          </div>
        ) : null}
        {runStatus?.stage === "awaiting_step" && runStatus.waitingStep && (
          <div className="step-actions">
            <button onClick={rerunStep}>수정 후 재실행</button>
            <button onClick={nextStep}>다음 단계 진행</button>
          </div>
        )}
        {runStatus?.stage === "awaiting_confirm" && (
          <button onClick={confirmRender}>이대로 렌더링할까요?</button>
        )}
        {runStatus?.videoUrl && (
          <video className="video" controls src={runStatus.videoUrl} />
        )}
      </div>
    </div>
  );
}
