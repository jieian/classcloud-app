import type { NextConfig } from "next";

// NEXT_PUBLIC_ vars are inlined at BUILD time — a key missing during `next build`
// becomes `undefined` forever in that production bundle, even if added to the
// runtime env later. Fail the build so a missing VAPID key is caught here, not
// silently shipped (push would break with "public key provided is invalid").
if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
  throw new Error(
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set. Run: npx web-push generate-vapid-keys",
  );
}

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
