"use client";

import { useEffect, useState } from "react";

type PartnerLink = {
  id: string;
  name: string;
  baseUrl: string;
  partnerCode?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

type AdsConfig = {
  ctaTemplates: string[];
  partnerLinks: PartnerLink[];
};

export default function AdminLabAds() {
  const [ctaText, setCtaText] = useState("");
  const [partnerLinks, setPartnerLinks] = useState<PartnerLink[]>([]);
  const [message, setMessage] = useState("");

  const loadConfig = async () => {
    const response = await fetch("/api/admin/ads/config", { cache: "no-store" });
    const payload = (await response.json()) as { data?: AdsConfig; error?: string };
    if (!response.ok || !payload.data) {
      setMessage(payload.error || "설정을 불러오지 못했습니다.");
      return;
    }
    setCtaText(payload.data.ctaTemplates.join("\n"));
    setPartnerLinks(payload.data.partnerLinks);
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  const handleSave = async () => {
    const ctaTemplates = ctaText
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    const response = await fetch("/api/admin/ads/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ctaTemplates, partnerLinks })
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || payload.ok === false) {
      setMessage(payload.error || "저장 실패");
      return;
    }
    setMessage("저장 완료");
  };

  const updatePartner = (id: string, patch: Partial<PartnerLink>) => {
    setPartnerLinks((prev) =>
      prev.map((link) => (link.id === id ? { ...link, ...patch } : link))
    );
  };

  const addPartner = () => {
    setPartnerLinks((prev) => [
      ...prev,
      {
        id: `partner-${Date.now()}`,
        name: "",
        baseUrl: "",
        partnerCode: "",
        utmSource: "",
        utmMedium: "",
        utmCampaign: ""
      }
    ]);
  };

  const removePartner = (id: string) => {
    setPartnerLinks((prev) => prev.filter((link) => link.id !== id));
  };

  return (
    <section className="lab-section">
      <h2>광고 / 링크</h2>
      <p>파트너스 링크 및 CTA 문구 관리</p>
      <div className="lab-action-row" style={{ marginTop: 12 }}>
        <a className="btn primary" href="/admin-lab/ads/mall">
          쇼핑몰 관리
        </a>
        <button className="btn" onClick={handleSave}>
          저장
        </button>
      </div>

      <div className="lab-card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>CTA 문구 관리</div>
        <textarea
          rows={6}
          value={ctaText}
          onChange={(event) => setCtaText(event.target.value)}
          placeholder={"한 줄에 하나씩 입력하세요."}
          style={{ width: "100%" }}
        />
      </div>

      <div className="lab-card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>파트너스 링크 관리</div>
        {partnerLinks.length === 0 ? (
          <div>등록된 링크가 없습니다.</div>
        ) : (
          <div className="lab-log-list">
            {partnerLinks.map((link) => (
              <div key={link.id} className="lab-log-row">
                <div className="lab-log-main" style={{ minWidth: 180 }}>
                  <div className="lab-log-title">{link.name || "미지정"}</div>
                  <div className="lab-log-reason">ID: {link.id}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="lab-form">
                    <label>
                      이름
                      <input
                        value={link.name}
                        onChange={(event) =>
                          updatePartner(link.id, { name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      기본 URL
                      <input
                        value={link.baseUrl}
                        onChange={(event) =>
                          updatePartner(link.id, { baseUrl: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      파트너 코드
                      <input
                        value={link.partnerCode || ""}
                        onChange={(event) =>
                          updatePartner(link.id, { partnerCode: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      UTM Source
                      <input
                        value={link.utmSource || ""}
                        onChange={(event) =>
                          updatePartner(link.id, { utmSource: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      UTM Medium
                      <input
                        value={link.utmMedium || ""}
                        onChange={(event) =>
                          updatePartner(link.id, { utmMedium: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      UTM Campaign
                      <input
                        value={link.utmCampaign || ""}
                        onChange={(event) =>
                          updatePartner(link.id, { utmCampaign: event.target.value })
                        }
                      />
                    </label>
                  </div>
                </div>
                <div className="lab-log-actions">
                  <button className="btn small warning" onClick={() => removePartner(link.id)}>
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="lab-action-row" style={{ marginTop: 8 }}>
          <button className="btn" onClick={addPartner}>
            파트너 링크 추가
          </button>
        </div>
      </div>
      {message ? <div className="lab-helper">{message}</div> : null}
    </section>
  );
}
