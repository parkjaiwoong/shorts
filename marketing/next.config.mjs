/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: [] },
    serverComponentsExternalPackages: [
      "@remotion/bundler",
      "@remotion/renderer",
      "esbuild"
    ]
  }
};

export default nextConfig;
