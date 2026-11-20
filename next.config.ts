import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,

  // ── Low-internet optimisations ────────────────────────────────────────────
  // 1. Compress all responses with gzip/brotli
  compress: true,

  // 2. Aggressive image optimisation for slow connections
  images: {
    formats: ["image/avif", "image/webp"],   // smallest modern formats first
    minimumCacheTTL: 86400,                  // cache images 24 h in CDN / browser
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
  },

  // 3. Keep bundle small — no source maps in production
  productionBrowserSourceMaps: false,
};

export default nextConfig;
