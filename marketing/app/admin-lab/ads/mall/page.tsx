"use client";

import { useEffect, useState } from "react";

type Product = {
  id: string;
  name: string;
  imageUrl?: string;
  baseUrl: string;
  category?: string;
  coupaIframe?: string;
};

type Mall = {
  id: string;
  name: string;
  description?: string;
  partnerCode?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  products?: Product[];
};

type CategoryImage = {
  category: string;
  imageUrl: string;
};

export default function AdminLabAdsMall() {
  const [malls, setMalls] = useState<Mall[]>([]);
  const [message, setMessage] = useState("");
  const [thumbnailLoading, setThumbnailLoading] = useState<Record<string, boolean>>({});
  const [thumbnailStatus, setThumbnailStatus] = useState<Record<string, string>>({});
  const [categoryImages, setCategoryImages] = useState<CategoryImage[]>([]);
  const [aiImageLoading, setAiImageLoading] = useState<Record<string, boolean>>({});
  const [newMall, setNewMall] = useState<Mall>({
    id: "",
    name: "",
    description: "",
    partnerCode: "",
    utmSource: "",
    utmMedium: "",
    utmCampaign: "",
    products: []
  });

  const loadMalls = async () => {
    const response = await fetch("/api/admin/ads/malls", { cache: "no-store" });
    const payload = (await response.json()) as { malls?: Mall[]; error?: string };
    if (!response.ok) {
      setMessage(payload.error || "목록을 불러오지 못했습니다.");
      return;
    }
    setMalls(payload.malls ?? []);
  };

  const loadAdsConfig = async () => {
    try {
      const response = await fetch("/api/admin/ads/config", { cache: "no-store" });
      const payload = (await response.json()) as {
        ok?: boolean;
        data?: { defaultCategoryImages?: CategoryImage[] };
        error?: string;
      };
      if (!response.ok || payload.ok === false) {
        console.error("카테고리 이미지 로드 실패:", payload.error);
        setMessage(`카테고리 이미지 로드 실패: ${payload.error || "알 수 없는 오류"}`);
        return;
      }
      const images = payload.data?.defaultCategoryImages ?? [];
      setCategoryImages(images);
      if (images.length === 0) {
        console.warn("카테고리 이미지가 없습니다. ads.json에 defaultCategoryImages를 추가하세요.");
      }
    } catch (error) {
      console.error("카테고리 이미지 로드 오류:", error);
      setMessage(`카테고리 이미지 로드 오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    }
  };

  useEffect(() => {
    void loadMalls();
    void loadAdsConfig();
  }, []);

  const handleCreate = async () => {
    if (!newMall.id || !newMall.name) {
      setMessage("쇼핑몰 ID와 이름은 필수입니다.");
      return;
    }
    const response = await fetch("/api/admin/ads/malls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newMall)
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || payload.ok === false) {
      setMessage(payload.error || "생성 실패");
      return;
    }
    setNewMall({
      id: "",
      name: "",
      description: "",
      partnerCode: "",
      utmSource: "",
      utmMedium: "",
      utmCampaign: "",
      products: []
    });
    setMessage("쇼핑몰이 생성되었습니다.");
    await loadMalls();
  };

  const handleUpdate = async (mall: Mall) => {
    const response = await fetch(`/api/admin/ads/malls/${mall.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mall)
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || payload.ok === false) {
      setMessage(payload.error || "저장 실패");
      return;
    }
    setMessage("저장 완료");
    await loadMalls();
  };

  const handleDelete = async (mallId: string) => {
    const response = await fetch(`/api/admin/ads/malls/${mallId}`, { method: "DELETE" });
    const payload = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || payload.ok === false) {
      setMessage(payload.error || "삭제 실패");
      return;
    }
    setMessage("삭제 완료");
    await loadMalls();
  };

  const updateMall = (mallId: string, patch: Partial<Mall>) => {
    setMalls((prev) =>
      prev.map((mall) => (mall.id === mallId ? { ...mall, ...patch } : mall))
    );
  };

  const buildPartnerUrl = (mall: Mall, product: Product) => {
    try {
      const url = new URL(product.baseUrl);
      if (mall.partnerCode) url.searchParams.set("subId", mall.partnerCode);
      if (mall.utmSource) url.searchParams.set("utm_source", mall.utmSource);
      if (mall.utmMedium) url.searchParams.set("utm_medium", mall.utmMedium);
      if (mall.utmCampaign) url.searchParams.set("utm_campaign", mall.utmCampaign);
      return url.toString();
    } catch {
      return product.baseUrl;
    }
  };

  const setThumbLoading = (productId: string, value: boolean) => {
    setThumbnailLoading((prev) => ({ ...prev, [productId]: value }));
  };
  const setThumbStatus = (productId: string, value: string) => {
    setThumbnailStatus((prev) => ({ ...prev, [productId]: value }));
  };
  const setAiLoading = (productId: string, value: boolean) => {
    setAiImageLoading((prev) => ({ ...prev, [productId]: value }));
  };

  const updateProduct = (mallId: string, productId: string, patch: Partial<Product>) => {
    setMalls((prev) =>
      prev.map((mall) => {
        if (mall.id !== mallId) return mall;
        const products = (mall.products || []).map((product) =>
          product.id === productId ? { ...product, ...patch } : product
        );
        return { ...mall, products };
      })
    );
  };

  const addProduct = (mallId: string) => {
    const newProduct: Product = {
      id: `product-${Date.now()}`,
      name: "",
      imageUrl: "",
      baseUrl: "",
      category: categoryImages[0]?.category || "",
      coupaIframe: ""
    };
    setMalls((prev) =>
      prev.map((mall) =>
        mall.id === mallId ? { ...mall, products: [...(mall.products || []), newProduct] } : mall
      )
    );
  };

  const applyCategoryImage = (mallId: string, productId: string, category?: string) => {
    if (!category) {
      setMessage("카테고리를 선택해주세요.");
      return;
    }
    if (categoryImages.length === 0) {
      setMessage("카테고리 이미지가 로드되지 않았습니다. 페이지를 새로고침해주세요.");
      console.error("categoryImages가 비어있습니다. loadAdsConfig를 확인하세요.");
      return;
    }
    const matched = categoryImages.find((item) => item.category === category);
    if (!matched) {
      setMessage(`카테고리 "${category}"에 대한 대표 이미지가 없습니다.`);
      console.warn(`카테고리 "${category}"를 찾을 수 없습니다. 사용 가능한 카테고리:`, categoryImages.map((i) => i.category));
      return;
    }
    updateProduct(mallId, productId, { imageUrl: matched.imageUrl });
    setMessage(`카테고리 대표 이미지가 적용되었습니다: ${matched.imageUrl}`);
  };

  const handleAiImage = async (mallId: string, product: Product) => {
    if (!product.name) {
      setMessage("상품명을 먼저 입력해주세요.");
      return;
    }
    setAiLoading(product.id, true);
    const prompt = `${product.category || "상품"} 대표 이미지, 깔끔한 스튜디오 제품 사진, 고품질`;
    try {
      const response = await fetch("/api/admin/ads/image-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, prompt })
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        imageUrl?: string;
        error?: string;
      };
      if (!response.ok || payload.ok === false || !payload.imageUrl) {
        const errorMsg = payload.error || `HTTP ${response.status}: AI 이미지 생성 실패`;
        console.error("AI 이미지 생성 실패:", errorMsg);
        setMessage(errorMsg);
        return;
      }
      updateProduct(mallId, product.id, { imageUrl: payload.imageUrl });
      setMessage(`AI 대표 이미지가 적용되었습니다: ${payload.imageUrl}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "AI 이미지 생성 실패";
      console.error("AI 이미지 생성 오류:", error);
      setMessage(errorMsg);
    } finally {
      setAiLoading(product.id, false);
    }
  };

  const removeProduct = (mallId: string, productId: string) => {
    setMalls((prev) =>
      prev.map((mall) => {
        if (mall.id !== mallId) return mall;
        const products = (mall.products || []).filter((product) => product.id !== productId);
        return { ...mall, products };
      })
    );
  };

  const handleAutoThumbnail = async (mallId: string, productId: string, url: string) => {
    if (!url) {
      setMessage("상품 URL을 먼저 입력해주세요.");
      return;
    }
    setThumbLoading(productId, true);
    setThumbStatus(productId, "요청 중...");
    try {
      const response = await fetch("/api/admin/ads/thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        imageUrl?: string;
        error?: string;
        finalUrl?: string;
        status?: number;
        jsonStatus?: number | null;
        jsonUrl?: string;
        mobileStatus?: number | null;
        mobileUrl?: string;
      };
      if (!response.ok || payload.ok === false || !payload.imageUrl) {
        const detail = [
          payload.error || "썸네일 생성 실패",
          payload.status ? `status=${payload.status}` : "",
          payload.finalUrl ? `url=${payload.finalUrl}` : "",
          typeof payload.jsonStatus === "number" ? `jsonStatus=${payload.jsonStatus}` : "",
          payload.jsonUrl ? `jsonUrl=${payload.jsonUrl}` : "",
          typeof payload.mobileStatus === "number" ? `mobileStatus=${payload.mobileStatus}` : "",
          payload.mobileUrl ? `mobileUrl=${payload.mobileUrl}` : ""
        ]
          .filter(Boolean)
          .join(" · ");
        console.error("썸네일 자동 생성 실패:", detail);
        setMessage(detail);
        setThumbStatus(productId, detail);
        return;
      }
      updateProduct(mallId, productId, { imageUrl: payload.imageUrl });
      setMessage(`썸네일이 적용되었습니다: ${payload.imageUrl}`);
      setThumbStatus(productId, "완료");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "썸네일 생성 실패";
      console.error("썸네일 자동 생성 오류:", error);
      setMessage(detail);
      setThumbStatus(productId, detail);
    } finally {
      setThumbLoading(productId, false);
    }
  };

  return (
    <section className="lab-section">
      <div className="lab-page-header">
        <div>
          <h2>쇼핑몰 관리</h2>
          <p>파트너스 연동 쇼핑몰 목록과 링크를 관리합니다.</p>
        </div>
        <a className="btn" href="/shop" target="_blank" rel="noreferrer">
          쇼핑몰로 가기
        </a>
      </div>

      <div className="lab-card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>신규 쇼핑몰 추가</div>
        <div className="lab-form" style={{ maxWidth: 520 }}>
          <label>
            쇼핑몰 ID (예: mall-001)
            <input
              value={newMall.id}
              onChange={(event) => setNewMall({ ...newMall, id: event.target.value })}
            />
          </label>
          <label>
            쇼핑몰 이름
            <input
              value={newMall.name}
              onChange={(event) => setNewMall({ ...newMall, name: event.target.value })}
            />
          </label>
          <label>
            설명
            <input
              value={newMall.description}
              onChange={(event) =>
                setNewMall({ ...newMall, description: event.target.value })
              }
            />
          </label>
          <label>
            파트너 코드
            <input
              value={newMall.partnerCode}
              onChange={(event) =>
                setNewMall({ ...newMall, partnerCode: event.target.value })
              }
            />
          </label>
          <label>
            UTM Source
            <input
              value={newMall.utmSource}
              onChange={(event) => setNewMall({ ...newMall, utmSource: event.target.value })}
            />
          </label>
          <label>
            UTM Medium
            <input
              value={newMall.utmMedium}
              onChange={(event) => setNewMall({ ...newMall, utmMedium: event.target.value })}
            />
          </label>
          <label>
            UTM Campaign
            <input
              value={newMall.utmCampaign}
              onChange={(event) =>
                setNewMall({ ...newMall, utmCampaign: event.target.value })
              }
            />
          </label>
        </div>
        <div className="lab-action-row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={handleCreate}>
            쇼핑몰 추가
          </button>
        </div>
      </div>

      <div className="lab-card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>쇼핑몰 목록</div>
        {malls.length === 0 ? (
          <div>등록된 쇼핑몰이 없습니다.</div>
        ) : (
          <div className="lab-log-list">
            {malls.map((mall) => (
              <div key={mall.id} className="lab-log-row">
                <div className="lab-log-main" style={{ minWidth: 220 }}>
                  <div className="lab-log-title">{mall.name}</div>
                  <div className="lab-log-reason">ID: {mall.id}</div>
                  <div className="lab-log-time">
                    상품 {mall.products?.length ?? 0}개
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="lab-form">
                    <label>
                      설명
                      <input
                        value={mall.description || ""}
                        onChange={(event) =>
                          updateMall(mall.id, { description: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      파트너 코드
                      <input
                        value={mall.partnerCode || ""}
                        onChange={(event) =>
                          updateMall(mall.id, { partnerCode: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      UTM Source
                      <input
                        value={mall.utmSource || ""}
                        onChange={(event) =>
                          updateMall(mall.id, { utmSource: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      UTM Medium
                      <input
                        value={mall.utmMedium || ""}
                        onChange={(event) =>
                          updateMall(mall.id, { utmMedium: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      UTM Campaign
                      <input
                        value={mall.utmCampaign || ""}
                        onChange={(event) =>
                          updateMall(mall.id, { utmCampaign: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 12 }}>상품 카드</div>
                    {(mall.products || []).length === 0 ? (
                      <div style={{ color: "#94a3b8", padding: "20px 0" }}>
                        등록된 상품이 없습니다.
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                          gap: 16,
                          marginBottom: 16
                        }}
                      >
                        {(mall.products || []).map((product) => (
                          <div
                            key={product.id}
                            style={{
                              border: "1px solid rgba(148,163,184,0.2)",
                              borderRadius: 12,
                              padding: 16,
                              background: "#0f1117",
                              display: "flex",
                              flexDirection: "column",
                              gap: 12
                            }}
                          >
                            <div
                              style={{
                                width: "100%",
                                aspectRatio: "1",
                                borderRadius: 8,
                                background: "#12121c",
                                border: "1px solid rgba(148,163,184,0.2)",
                                overflow: "hidden",
                                position: "relative"
                              }}
                            >
                              {product.imageUrl ? (
                                <img
                                  src={product.imageUrl}
                                  alt={product.name || "preview"}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover"
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "#64748b",
                                    fontSize: 13
                                  }}
                                >
                                  이미지 없음
                                </div>
                              )}
                            </div>
                            <div className="lab-form" style={{ gap: 8 }}>
                              <label style={{ fontSize: 12 }}>
                                상품명
                                <input
                                  value={product.name}
                                  onChange={(event) =>
                                    updateProduct(mall.id, product.id, {
                                      name: event.target.value
                                    })
                                  }
                                  placeholder="상품명 입력"
                                  style={{ fontSize: 13, padding: "8px 10px" }}
                                />
                              </label>
                              <label style={{ fontSize: 12 }}>
                                카테고리
                                <select
                                  value={product.category || ""}
                                  onChange={(event) => {
                                    const selectedCategory = event.target.value;
                                    // 카테고리 선택 시 자동으로 해당 카테고리의 이미지도 함께 적용
                                    const updateData: Partial<Product> = {
                                      category: selectedCategory
                                    };
                                    if (selectedCategory) {
                                      const matched = categoryImages.find(
                                        (item) => item.category === selectedCategory
                                      );
                                      if (matched) {
                                        updateData.imageUrl = matched.imageUrl;
                                      }
                                    }
                                    updateProduct(mall.id, product.id, updateData);
                                  }}
                                  style={{ fontSize: 13, padding: "8px 10px" }}
                                >
                                  <option value="">선택</option>
                                  {categoryImages.map((item) => (
                                    <option key={item.category} value={item.category}>
                                      {item.category}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label style={{ fontSize: 12 }}>
                                이미지 URL
                                <input
                                  value={product.imageUrl || ""}
                                  onChange={(event) =>
                                    updateProduct(mall.id, product.id, {
                                      imageUrl: event.target.value
                                    })
                                  }
                                  placeholder="https://..."
                                  style={{ fontSize: 13, padding: "8px 10px" }}
                                />
                              </label>
                              <label style={{ fontSize: 12 }}>
                                상품 URL
                                <input
                                  value={product.baseUrl}
                                  onChange={(event) =>
                                    updateProduct(mall.id, product.id, {
                                      baseUrl: event.target.value
                                    })
                                  }
                                  placeholder="https://..."
                                  style={{ fontSize: 13, padding: "8px 10px" }}
                                />
                              </label>
                              <label style={{ fontSize: 12 }}>
                                쿠팡 파트너스 iframe
                                <textarea
                                  value={product.coupaIframe || ""}
                                  onChange={(event) =>
                                    updateProduct(mall.id, product.id, {
                                      coupaIframe: event.target.value
                                    })
                                  }
                                  placeholder='<iframe src="https://coupa.ng/..." ...></iframe>'
                                  rows={3}
                                  style={{
                                    fontSize: 12,
                                    padding: "8px 10px",
                                    fontFamily: "monospace",
                                    resize: "vertical"
                                  }}
                                />
                                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                                  쿠팡 파트너스에서 받은 iframe 태그를 붙여넣으세요
                                </div>
                              </label>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 6,
                                marginTop: 4
                              }}
                            >
                              <button
                                className="btn small warning"
                                onClick={() => removeProduct(mall.id, product.id)}
                                style={{ fontSize: 12, padding: "6px 10px" }}
                              >
                                삭제
                              </button>
                              <button
                                className="btn small"
                                onClick={() =>
                                  handleAutoThumbnail(mall.id, product.id, product.baseUrl)
                                }
                                disabled={Boolean(thumbnailLoading[product.id])}
                                style={{ fontSize: 12, padding: "6px 10px" }}
                              >
                                {thumbnailLoading[product.id] ? "생성 중..." : "썸네일 자동"}
                              </button>
                              <button
                                className="btn small"
                                onClick={() =>
                                  applyCategoryImage(mall.id, product.id, product.category)
                                }
                                style={{ fontSize: 12, padding: "6px 10px" }}
                              >
                                카테고리 이미지
                              </button>
                              <button
                                className="btn small"
                                onClick={() => handleAiImage(mall.id, product)}
                                disabled={Boolean(aiImageLoading[product.id])}
                                style={{ fontSize: 12, padding: "6px 10px" }}
                              >
                                {aiImageLoading[product.id] ? "AI 생성 중..." : "AI 이미지"}
                              </button>
                              <a
                                className="btn small"
                                href={product.baseUrl ? buildPartnerUrl(mall, product) : undefined}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: 12, padding: "6px 10px" }}
                              >
                                링크 미리보기
                              </a>
                            </div>
                            {thumbnailStatus[product.id] ? (
                              <div
                                style={{
                                  marginTop: 4,
                                  fontSize: 11,
                                  color: "#94a3b8",
                                  padding: "6px 8px",
                                  background: "rgba(148,163,184,0.1)",
                                  borderRadius: 6
                                }}
                              >
                                {thumbnailStatus[product.id]}
                              </div>
                            ) : null}
                            <div
                              style={{
                                fontSize: 11,
                                color: "#64748b",
                                marginTop: 4,
                                paddingTop: 8,
                                borderTop: "1px solid rgba(148,163,184,0.1)"
                              }}
                            >
                              ID: {product.id}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="lab-action-row" style={{ marginTop: 8 }}>
                      <button className="btn" onClick={() => addProduct(mall.id)}>
                        상품 추가
                      </button>
                    </div>
                  </div>
                </div>
                <div className="lab-log-actions">
                  <button className="btn small" onClick={() => handleUpdate(mall)}>
                    저장
                  </button>
                  <button className="btn small warning" onClick={() => handleDelete(mall.id)}>
                    삭제
                  </button>
                  <a className="btn small" href={`/shop/${mall.id}`} target="_blank">
                    쇼핑몰로 가기
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
        {message ? <div className="lab-helper">{message}</div> : null}
      </div>
    </section>
  );
}
