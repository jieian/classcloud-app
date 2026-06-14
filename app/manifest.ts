import type { MetadataRoute } from "next";

// Next.js serves this at /manifest.webmanifest and auto-injects
// <link rel="manifest"> into every page's <head>.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ClassCloud",
    short_name: "ClassCloud",
    description:
      "A Centralized Quarterly Test Reports System for Baliwag North Central School",
    start_url: "/?source=pwa",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4EAE4A",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Android home-screen long-press shortcuts (deep-link into a tab, like
    // YouTube's Shorts/Search). Not rendered on iOS. Routes are permission-gated.
    shortcuts: [
      {
        name: "Classes",
        short_name: "Classes",
        url: "/school/classes?source=pwa-shortcut",
        icons: [{ src: "/icons/classes-192.png", sizes: "192x192" }],
      },
      {
        name: "Examinations",
        short_name: "Exams",
        url: "/exam?source=pwa-shortcut",
        icons: [{ src: "/icons/examinations-192.png", sizes: "192x192" }],
      },
      {
        name: "Reports",
        short_name: "Reports",
        url: "/reports?source=pwa-shortcut",
        icons: [{ src: "/icons/reports-192.png", sizes: "192x192" }],
      },
    ],
  };
}
