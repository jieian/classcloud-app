/// <reference lib="webworker" />
//
// ClassCloud service worker (Serwist).
//
// WebWorker types are scoped to THIS file via the triple-slash directive above
// — we intentionally do NOT add "webworker" to tsconfig.json's global lib array,
// which would conflict with "dom" (clashing `self`, `fetch`, etc.) across the app.
//
// Conservative caching policy: static assets + the app shell are cached, but
// authenticated data (/api/* and Supabase) is ALWAYS network — never served
// stale or cross-user. Server-side Redis/Next.js caches remain the real
// DB-read reducers.

import { defaultCache } from "@serwist/next/worker";
import type {
  PrecacheEntry,
  RuntimeCaching,
  SerwistGlobalConfig,
} from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const runtimeCaching: RuntimeCaching[] = [
  // Never cache authenticated app data — always hit the network.
  {
    matcher: ({ url }) => url.pathname.startsWith("/api/"),
    handler: new NetworkOnly(),
  },
  // Never cache Supabase (auth/data) responses.
  {
    matcher: ({ url }) => url.hostname.endsWith(".supabase.co"),
    handler: new NetworkOnly(),
  },
  // Static chunks, fonts, images, navigations — Next-tuned strategies.
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
});

serwist.addEventListeners();
