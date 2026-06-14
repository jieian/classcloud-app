// Serwist "configurator mode" build config.
//
// Run as a post-build step: `next build && serwist build serwist.config.mjs`.
// This is bundler-agnostic (works with Turbopack) because it builds the service
// worker via esbuild AFTER Next.js finishes, rather than hooking into webpack.
//
// `serwist()` resolves the Next.js config, globs the prerendered routes + public
// assets into a precache manifest, injects it into app/sw.ts, and writes the
// bundled worker to public/sw.js.
import { serwist } from "@serwist/next/config";

export default serwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // Keep heavy public assets OUT of the precache so install stays lean — they
  // load on-demand at runtime. (opencv.js is ~10.8MB; omr-worker.js ~35KB.)
  globIgnores: ["**/opencv.js", "**/omr-worker.js"],
});
