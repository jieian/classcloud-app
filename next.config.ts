import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 30,
    },
  },
  // OpenCV.js is served from /public/opencv.js and loaded via <Script> at
  // runtime — no bundler involvement needed.
  turbopack: {},
};

export default nextConfig;
