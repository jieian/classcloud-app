import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.254.194'],
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

export default nextConfig;
