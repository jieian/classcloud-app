// layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "./globals.css";

import { Notifications } from "@mantine/notifications";
import "@mantine/notifications/styles.css";

import { AuthProvider } from "@/context/AuthContext";

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
          theme={{
            fontFamily: "Geist, sans-serif",
            headings: { fontFamily: "Geist, sans-serif" },
          }}
        >
          <Notifications position="bottom-right" />
          <AuthProvider>{children}</AuthProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
