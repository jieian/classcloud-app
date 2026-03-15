import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 30,
    },
  },
  webpack: (config) => {
    // OpenCV.js ships a pre-built WASM bundle that webpack cannot parse —
    // attempting to do so causes "Maximum call stack size exceeded".
    // noParse tells webpack to bundle the file as-is without traversing it.
    const existing = config.module.noParse;
    config.module.noParse = existing
      ? [existing, /opencv/].flat()
      : /opencv/;
    return config;
  },
};

export default nextConfig;
