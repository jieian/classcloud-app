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
import { Center, Loader } from "@mantine/core";

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
  const { user, permissions, loading } = useAuth();
  const router = useRouter();

  const hasRequiredPermission =
    match === "all"
      ? requiredPermissions.every((p) => permissions.includes(p))
      : requiredPermissions.some((p) => permissions.includes(p));

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push("/login");
      return;
    }

    if (!hasRequiredPermission) {
      router.push("/unauthorized");
    }
  }, [user, loading, hasRequiredPermission, router]);

  if (loading) {
    if (loadingFallback) return <>{loadingFallback}</>;
    return (
      <Center h="60vh">
        <Loader size="md" />
      </Center>
    );
  }

  if (!user) return null;

  if (!hasRequiredPermission) return null;

  return <>{children}</>;
}
