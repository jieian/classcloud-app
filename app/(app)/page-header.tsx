// app/(app)/page-header.tsx
"use client";

import { Title } from "@mantine/core";
import { usePathname } from "next/navigation";

export function PageHeader() {
  const pathname = usePathname();

  const getPageTitle = (path: string) => {
    const pathSegments = path.split("/").filter(Boolean);
    if (pathSegments.length === 0) return "Home";
    return (
      pathSegments[pathSegments.length - 1].charAt(0).toUpperCase() +
      pathSegments[pathSegments.length - 1].slice(1)
    );
  };

  return <Title order={2}>{getPageTitle(pathname)}</Title>;
}
