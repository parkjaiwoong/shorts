"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: 24
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>관리자 화면 선택</h1>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Link
          href="/admin"
          style={{
            minWidth: 240,
            padding: "18px 24px",
            borderRadius: 12,
            background: "#111827",
            color: "#fff",
            textAlign: "center",
            fontSize: 16,
            fontWeight: 600,
            textDecoration: "none"
          }}
        >
          기존 관리자 (/admin)
        </Link>
        <Link
          href="/admin-lab"
          style={{
            minWidth: 240,
            padding: "18px 24px",
            borderRadius: 12,
            background: "#2563eb",
            color: "#fff",
            textAlign: "center",
            fontSize: 16,
            fontWeight: 600,
            textDecoration: "none"
          }}
        >
          신규 관리자 (/admin-lab)
        </Link>
      </div>
    </div>
  );
}
