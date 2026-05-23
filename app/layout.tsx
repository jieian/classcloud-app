// layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import "@mantine/core/styles.css";
import "./globals.css";

import "@mantine/notifications/styles.css";
import DynamicNotifications from "@/app/(app)/exam/_components/ExamNotificationsPosition";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ClassCloud",
  description:
    "A Centralized Quarterly Test Reports System for Baliwag North Central School",
  icons: {
    icon: "/icon.png",
  },
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
        <MantineProvider
          forceColorScheme="light"
          theme={{
            fontFamily: "Geist, sans-serif",
            headings: { fontFamily: "Geist, sans-serif" },
          }}
        >
          <ModalsProvider>
            <DynamicNotifications />
            {children}
          </ModalsProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
