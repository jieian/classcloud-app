import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Prevent the client-side Router Cache from serving stale pages.
    // Without this, navigating back can restore cached RSC payloads
    // where client components fail to re-initialize properly.
    staleTimes: {
      dynamic: 0,
      static: 30,
    },
  },
};

export default nextConfig;
