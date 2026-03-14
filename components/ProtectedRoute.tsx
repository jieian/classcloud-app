"use client";

/**
 * Protected Route Component
 * Client Component that checks permissions from AuthContext
 * instead of fetching from the database on every page load.
 */

import { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Center, Loader, Stack, Text, Title } from "@mantine/core";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermissions: string[];
  match?: "all" | "any";
  loadingFallback?: ReactNode;
}

export default function ProtectedRoute({
  children,
  requiredPermissions,
  match = "all",
  loadingFallback,
}: ProtectedRouteProps) {
  const { user, permissions, permissionsLoaded, loading } = useAuth();
  const router = useRouter();

  const hasRequiredPermission =
    match === "all"
      ? requiredPermissions.every((p) => permissions.includes(p))
      : requiredPermissions.some((p) => permissions.includes(p));

  // Only redirect to login if the user is definitively signed out.
  // Never redirect to /unauthorized — handle it inline so a momentary
  // background-refresh mis-state never navigates the user away from the page.
  useEffect(() => {
    if (loading || !permissionsLoaded) return;
    if (!user) {
      router.push("/login");
    }
  }, [user, loading, permissionsLoaded, router]);

  // Show loader while auth is resolving or permissions are still being fetched.
  if (loading || !permissionsLoaded) {
    if (loadingFallback) return <>{loadingFallback}</>;
    return (
      <Center h="60vh">
        <Loader size="md" />
      </Center>
    );
  }

  if (!user) return null;

  if (!hasRequiredPermission) {
    return (
      <Center h="60vh">
        <Stack align="center" gap="xs">
          <Title order={3}>Access Denied</Title>
          <Text c="dimmed" size="sm">
            You don&apos;t have permission to view this page.
          </Text>
        </Stack>
      </Center>
    );
  }

  return <>{children}</>;
}
