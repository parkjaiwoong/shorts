"use client";

import { useEffect, useState } from "react";

type ClientItem = {
  id: string;
  name: string;
  phone: string;
  location: string;
  default_cta: string;
  created_at?: string;
};

const emptyForm = {
  name: "",
  phone: "",
  location: "",
  default_cta: ""
};

export default function AdminLabClients() {
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const loadClients = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/clients");
      const payload = (await response.json()) as { clients?: ClientItem[] };
      setClients(payload.clients ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "목록 로드 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadClients();
  }, []);

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setMessage("업체명을 입력해주세요.");
      return;
    }
    setMessage("");
    const response = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string };
    if (payload.ok === false) {
      setMessage(payload.error || "등록 실패");
      return;
    }
    setForm(emptyForm);
    await loadClients();
  };

  return (
    <section className="lab-section">
      <div className="lab-page-header">
        <div>
          <h2>고객 관리</h2>
          <p>업체 정보 및 기본 CTA를 관리합니다.</p>
        </div>
      </div>

      <div className="lab-card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>고객 등록</div>
        <div className="lab-form" style={{ maxWidth: 520 }}>
          <label>
            업체명 (필수)
            <input
              type="text"
              value={form.name}
              onChange={(event) => handleChange("name", event.target.value)}
            />
          </label>
          <label>
            전화번호
            <input
              type="text"
              value={form.phone}
              onChange={(event) => handleChange("phone", event.target.value)}
            />
          </label>
          <label>
            위치
            <input
              type="text"
              value={form.location}
              onChange={(event) => handleChange("location", event.target.value)}
            />
          </label>
          <label>
            기본 CTA
            <input
              type="text"
              value={form.default_cta}
              onChange={(event) => handleChange("default_cta", event.target.value)}
            />
          </label>
        </div>
        <div className="lab-action-row" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={handleCreate}>
            등록
          </button>
        </div>
        {message ? <div className="lab-helper">{message}</div> : null}
      </div>

      <div className="lab-card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>고객 목록</div>
        {loading ? (
          <div>로딩 중...</div>
        ) : clients.length === 0 ? (
          <div>등록된 고객이 없습니다.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 12, color: "#6b7280" }}>
                  <th style={{ padding: "8px 6px" }}>선택</th>
                  <th style={{ padding: "8px 6px" }}>업체명</th>
                  <th style={{ padding: "8px 6px" }}>고객 ID</th>
                  <th style={{ padding: "8px 6px" }}>전화</th>
                  <th style={{ padding: "8px 6px" }}>위치</th>
                  <th style={{ padding: "8px 6px" }}>기본 CTA</th>
                  <th style={{ padding: "8px 6px" }}>등록일</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr
                    key={client.id}
                    style={{
                      borderTop: "1px solid #e5e7eb",
                      background: selectedId === client.id ? "#eff6ff" : "transparent"
                    }}
                  >
                    <td style={{ padding: "8px 6px" }}>
                      <input
                        type="radio"
                        name="client-select"
                        checked={selectedId === client.id}
                        onChange={() => setSelectedId(client.id)}
                      />
                    </td>
                    <td style={{ padding: "8px 6px", fontWeight: 600 }}>
                      {client.name}
                    </td>
                    <td style={{ padding: "8px 6px", fontSize: 12 }}>{client.id}</td>
                    <td style={{ padding: "8px 6px" }}>{client.phone || "-"}</td>
                    <td style={{ padding: "8px 6px" }}>{client.location || "-"}</td>
                    <td style={{ padding: "8px 6px" }}>{client.default_cta || "-"}</td>
                    <td style={{ padding: "8px 6px", fontSize: 12 }}>
                      {client.created_at
                        ? client.created_at.replace("T", " ").slice(0, 16)
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
