import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    useCache: true,
    staleTimes: {
      dynamic: 0,
      static: 30,
    },
  },
  // opencv.js is served from /public/opencv.js and injected at runtime via
  // a dynamic <script> tag in omrService.ts — never bundled by webpack/turbopack.
  turbopack: {},
};

// PWA service worker is built by Serwist in "configurator mode" (see
// serwist.config.mjs) as a post-build step — `next build && serwist build`.
// This keeps the integration bundler-agnostic so it works with Turbopack,
// unlike the webpack-based `withSerwistInit` plugin. The SW is registered
// client-side via <SerwistProvider> in app/layout.tsx.
export default nextConfig;
