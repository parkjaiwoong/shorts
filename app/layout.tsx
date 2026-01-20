import "./globals.css";

export const metadata = {
  title: "SHOT_LO_PRO",
  description: "AI 숏폼 자동 제작 모듈"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
