// app/(app)/layout.tsx (The Simple, Robust "OG" Version)
"use client";

import { Title } from "@mantine/core";
import NavBar from "@/components/navBar/NavBar";
import { usePathname } from "next/navigation";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const getPageTitle = (path: string) => {
    const pathSegments = path.split("/").filter(Boolean);
    if (pathSegments.length === 0) return "Home";
    return (
      pathSegments[pathSegments.length - 1].charAt(0).toUpperCase() +
      pathSegments[pathSegments.length - 1].slice(1)
    );
  };

  return (
    // A simple flex container is all we need
    <div style={{ display: "flex", height: "100vh" }}>
      {/* The Navbar on the left */}
      <NavBar />

      {/* The main content on the right */}
      <main
        style={{
          flexGrow: 1, // Takes up the remaining space
          padding: "var(--mantine-spacing-lg)",
          overflowY: "auto", // Allows content to scroll if it's too long
        }}
      >
        <Title order={2}>{getPageTitle(pathname)}</Title>
        <div style={{ marginTop: "var(--mantine-spacing-md)" }}>{children}</div>
      </main>
    </div>
  );
}
