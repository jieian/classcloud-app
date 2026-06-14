// layout.tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { SerwistProvider } from "@serwist/next/react";
import "@mantine/core/styles.css";
import "./globals.css";

import "@mantine/notifications/styles.css";
import "@mantine/charts/styles.css";
import AppNotifications from "@/components/notificationIcon/NotificationsPosition";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "ClassCloud",
  title: {
    default: "ClassCloud",
    template: "%s · ClassCloud",
  },
  description:
    "A Centralized Quarterly Test Reports System for Baliwag North Central School",
  // <link rel="manifest"> is auto-injected by app/manifest.ts.
  appleWebApp: {
    capable: true, // launch standalone (no Safari chrome) when added to Home Screen
    statusBarStyle: "default",
    title: "ClassCloud",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: "/icon.png",
    apple: "/icons/apple-touch-icon.png", // iOS Home Screen icon (opaque)
  },
};

export const viewport: Viewport = {
  themeColor: "#4EAE4A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // respect iOS safe-area / notch in standalone
  // Intentionally NOT locking maximumScale — keep pinch-zoom for accessibility.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Registers /sw.js client-side. Disabled in dev (no SW is built there),
            so Turbopack `next dev` is unaffected. */}
        <SerwistProvider
          swUrl="/sw.js"
          disable={process.env.NODE_ENV === "development"}
        >
          <MantineProvider
            forceColorScheme="light"
            theme={{
              fontFamily: "Geist, sans-serif",
              headings: { fontFamily: "Geist, sans-serif" },
            }}
          >
            <ModalsProvider>
              <AppNotifications />
              {children}
              <SpeedInsights />
              <Analytics />
            </ModalsProvider>
          </MantineProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
