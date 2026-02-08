/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: [] },
    serverComponentsExternalPackages: [
      "@remotion/bundler",
      "@remotion/renderer",
      "esbuild"
    ]
  },
  async headers() {
    return [
      {
        // 쇼핑몰 페이지를 iframe으로 임베드 가능하도록 설정
        source: "/shop/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            // 'SAMEORIGIN': 같은 도메인에서만 iframe 허용
            // 'ALLOWALL': 모든 도메인에서 허용 (보안 주의)
            // 특정 도메인만 허용하려면 Content-Security-Policy 사용
            value: "SAMEORIGIN"
          },
          {
            key: "Content-Security-Policy",
            // frame-ancestors로 특정 도메인만 허용 가능
            // 예: "frame-ancestors 'self' https://trusted-domain.com"
            value: "frame-ancestors 'self'"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
