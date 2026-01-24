import Link from "next/link";

const LAB_MENU = [
  { label: "대시보드", href: "/admin-lab/dashboard" },
  { label: "영상 관리", href: "/admin-lab/videos" },
  { label: "영상 가공", href: "/admin-lab/editor" },
  { label: "업로드 실행", href: "/admin-lab/upload" },
  { label: "광고 / 링크", href: "/admin-lab/ads" },
  { label: "고객 관리 (관리자 전용)", href: "/admin-lab/clients" },
  { label: "로그 / 실패 관리", href: "/admin-lab/logs" },
  { label: "설정 (MVP)", href: "/admin-lab/settings" }
];

export default function AdminLabLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lab-layout">
      <aside className="lab-sidebar">
        <div className="lab-title">실험실 (MVP)</div>
        <nav className="lab-nav">
          {LAB_MENU.map((item) => (
            <Link key={item.href} href={item.href} className="lab-link">
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="lab-content">
        <header className="lab-header">
          <div className="lab-header-title">MVP 관리자</div>
          <Link className="lab-back" href="/admin">
            기존 관리자 화면으로 이동
          </Link>
        </header>
        <main className="lab-main">{children}</main>
      </div>
    </div>
  );
}
