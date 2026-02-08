"use client";

import { useEffect, useMemo, useState } from "react";

type ClientItem = {
  id: string;
  name: string;
  phone: string;
  location: string;
  default_cta: string;
};

type RawVideo = {
  videoId: string;
  customerId: string;
  name: string;
  size: number;
  createdAt: string;
};

type FontItem = {
  name: string;
  path: string;
};

export default function AdminLabEditor() {
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [videos, setVideos] = useState<RawVideo[]>([]);
  const [fonts, setFonts] = useState<FontItem[]>([]);
  const [clientId, setClientId] = useState("");
  const [videoId, setVideoId] = useState("");
  const [message, setMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [qcTest, setQcTest] = useState<"" | "audio_missing" | "resolution_mismatch">("");
  const [fontPath, setFontPath] = useState("");
  const [fontSize, setFontSize] = useState(56);
  const [captionInput, setCaptionInput] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [removeWatermark, setRemoveWatermark] = useState(false);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === clientId) || null,
    [clients, clientId]
  );

  const captionPreview = useMemo(() => {
    if (!selectedClient) return "";
    const parts = [selectedClient.name];
    if (selectedClient.phone) parts.push(selectedClient.phone);
    if (selectedClient.location) parts.push(selectedClient.location);
    if (selectedClient.default_cta) parts.push(selectedClient.default_cta);
    return parts.join(" · ");
  }, [selectedClient]);

  const captionValue = captionInput.trim() || captionPreview;

  const loadClients = async () => {
    const response = await fetch("/api/admin/clients", { cache: "no-store" });
    const payload = (await response.json()) as { clients?: ClientItem[] };
    setClients(payload.clients ?? []);
  };

  const loadFonts = async () => {
    const response = await fetch("/api/admin/fonts", { cache: "no-store" });
    const payload = (await response.json()) as { fonts?: FontItem[] };
    const list = payload.fonts ?? [];
    setFonts(list);
    if (!fontPath && list.length > 0) {
      setFontPath(list[0].path);
    }
  };

  const loadVideos = async (customer: string) => {
    if (!customer) {
      setVideos([]);
      return;
    }
    const response = await fetch(
      `/api/admin/videos/raw?customerId=${customer}`,
      { cache: "no-store" }
    );
    const payload = (await response.json()) as { files?: RawVideo[] };
    setVideos(payload.files ?? []);
  };

  useEffect(() => {
    void loadClients();
    void loadFonts();
  }, []);

  useEffect(() => {
    setVideoId("");
    void loadVideos(clientId);
  }, [clientId]);

  const handleProcess = async () => {
    if (!clientId) {
      setMessage("고객을 선택해주세요.");
      return;
    }
    if (!videoId) {
      setMessage("영상을 선택해주세요.");
      return;
    }
    setIsProcessing(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/process/shorts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          videoId,
          qcTest: qcTest || undefined,
          caption: captionValue || undefined,
          fontPath: fontPath || undefined,
          fontSize: fontSize || undefined,
          removeWatermark
        })
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || payload.ok === false) {
        setMessage(payload.error || "가공 실패");
        return;
      }
      setMessage("가공 완료: processed에 저장되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "가공 실패");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePreview = async () => {
    if (!clientId || !videoId) {
      setMessage("미리보기를 위해 고객과 영상을 선택해주세요.");
      return;
    }
    setIsPreviewing(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/process/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          videoId,
          caption: captionValue || undefined,
          fontPath: fontPath || undefined,
          fontSize,
          removeWatermark
        })
      });
      const payload = (await response.json()) as { ok?: boolean; dataUrl?: string; error?: string };
      if (!response.ok || payload.ok === false || !payload.dataUrl) {
        setMessage(payload.error || "미리보기 생성 실패");
        return;
      }
      setPreviewUrl(payload.dataUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "미리보기 생성 실패");
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleAiCaption = async () => {
    if (!clientId) {
      setMessage("자막 생성 전에 고객을 선택해주세요.");
      return;
    }
    setIsGeneratingCaption(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/ai/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId })
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        caption?: string;
        error?: string;
        source?: string;
        reason?: string;
        model?: string;
        tokenPresent?: boolean;
      };
      if (!response.ok || payload.ok === false || !payload.caption) {
        setMessage(payload.error || "AI 자막 생성 실패");
        return;
      }
      setCaptionInput(payload.caption);
      const source = payload.source === "huggingface" ? "HuggingFace" : "로컬";
      const detail =
        payload.source === "huggingface"
          ? `모델: ${payload.model || "unknown"}`
          : `사유: ${payload.reason || "unknown"} · token=${payload.tokenPresent ? "있음" : "없음"}`;
      setMessage(`AI 자막 생성: ${source} (${detail})`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI 자막 생성 실패");
    } finally {
      setIsGeneratingCaption(false);
    }
  };

  const canProcess = Boolean(clientId && videoId && !isProcessing);

  return (
    <section className="lab-section">
      <div className="lab-page-header">
        <div>
          <h2>영상 가공</h2>
          <p>고객 정보와 원본 영상을 선택해 쇼츠를 생성합니다.</p>
        </div>
      </div>

      <div className="lab-card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>필수 선택</div>
        <div className="lab-form" style={{ maxWidth: 520 }}>
          <label>
            고객 선택 (필수)
            <select
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
            >
              <option value="">고객을 선택하세요</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            원본 영상 선택 (필수)
            <select
              value={videoId}
              onChange={(event) => setVideoId(event.target.value)}
            >
              <option value="">영상을 선택하세요</option>
              {videos.map((video) => (
                <option key={video.videoId} value={video.videoId}>
                  {video.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="lab-card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>자막/폰트 설정</div>
        <div className="lab-form" style={{ maxWidth: 520 }}>
          <label>
            자막 내용 (수정 가능)
            <textarea
              rows={1}
              wrap="off"
              value={captionInput}
              placeholder={captionPreview || "고객을 선택하면 기본 자막이 생성됩니다."}
              onChange={(event) => setCaptionInput(event.target.value)}
              style={{
                fontSize: 18,
                lineHeight: 1.6,
                whiteSpace: "pre",
                overflowX: "auto",
                width: "520px",
                maxWidth: "100%"
              }}
            />
          </label>
          <div className="lab-action-row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={handleAiCaption} disabled={isGeneratingCaption}>
              {isGeneratingCaption ? "AI 생성 중..." : "AI 자막 생성"}
            </button>
            <button className="btn" onClick={() => setCaptionInput(captionPreview)}>
              기본 자막 적용
            </button>
          </div>
          <label style={{ marginTop: 12 }}>
            폰트 선택
            <select value={fontPath} onChange={(event) => setFontPath(event.target.value)}>
              {fonts.map((font) => (
                <option key={font.path} value={font.path}>
                  {font.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            폰트 크기 ({fontSize})
            <input
              type="range"
              min={28}
              max={96}
              value={fontSize}
              onChange={(event) => setFontSize(Number(event.target.value))}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={removeWatermark}
              onChange={(event) => setRemoveWatermark(event.target.checked)}
              style={{ marginRight: 8 }}
            />
            워터마크 제거
          </label>
        </div>
      </div>

      <div className="lab-card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>미리보기</div>
        <div className="lab-action-row" style={{ marginBottom: 8 }}>
          <button className="btn" onClick={handlePreview} disabled={isPreviewing}>
            {isPreviewing ? "미리보기 생성 중..." : "미리보기 업데이트"}
          </button>
        </div>
        {previewUrl ? (
          <img src={previewUrl} alt="preview" style={{ maxWidth: 320 }} />
        ) : (
          <div className="lab-helper">미리보기를 생성하면 화면에 표시됩니다.</div>
        )}
      </div>

      <div className="lab-card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>QA 테스트 옵션</div>
        <div className="lab-form" style={{ maxWidth: 420 }}>
          <label>
            강제 QC 실패
            <select
              value={qcTest}
              onChange={(event) =>
                setQcTest(event.target.value as "" | "audio_missing" | "resolution_mismatch")
              }
            >
              <option value="">사용 안 함</option>
              <option value="audio_missing">오디오 없음</option>
              <option value="resolution_mismatch">해상도 불일치</option>
            </select>
          </label>
          <div className="lab-helper">테스트 용도이며 실제 파일에는 영향이 없습니다.</div>
        </div>
      </div>

      <div className="lab-action-row" style={{ marginTop: 16 }}>
        <button className="btn primary" disabled={!canProcess} onClick={handleProcess}>
          {isProcessing ? "가공 중..." : "가공 실행"}
        </button>
        <button
          className="btn"
          onClick={() => loadVideos(clientId)}
          disabled={isProcessing}
        >
          영상 새로고침
        </button>
      </div>
      {message ? <div className="lab-helper">{message}</div> : null}
    </section>
  );
}
