import ShopUtmLogger from "./ShopUtmLogger";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", color: "#e5e7eb" }}>
      <ShopUtmLogger />
      <header
        style={{
          padding: "20px 24px",
          borderBottom: "1px solid rgba(148,163,184,0.2)"
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700 }}>광고 쇼핑몰</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
          유튜브·틱톡에서 들어오는 전용 쇼핑몰 페이지
        </div>
      </header>
      <main style={{ padding: "24px" }}>{children}</main>
      <footer
        style={{
          padding: "16px 24px",
          borderTop: "1px solid rgba(148,163,184,0.2)",
          color: "#94a3b8",
          fontSize: 12
        }}
      >
        © SHOT LO PRO · 광고 쇼핑몰
      </footer>
    </div>
  );
}
