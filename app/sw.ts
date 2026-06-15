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

// ── Web Push (PWA Phase 2) ──────────────────────────────────────────────────
// Payload is generic JSON { title, body, url } from lib/push/webPush.ts.

type PushPayload = { title: string; body?: string; url?: string };

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;
  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    payload = { title: "ClassCloud", body: event.data.text() };
  }
  const url = payload.url || "/";
  event.waitUntil(
    self.registration.showNotification(payload.title || "ClassCloud", {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png", // monochrome status-bar glyph (Android)
      data: { url },
      tag: url, // collapse repeat notifications that deep-link to the same place
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const data = event.notification.data as { url?: string } | undefined;
  const target = new URL(data?.url || "/", self.location.origin);
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing tab already on the target path, else open one.
        for (const client of clientList) {
          if (new URL(client.url).pathname === target.pathname) {
            return client.focus();
          }
        }
        return self.clients.openWindow(target.href);
      }),
  );
});
