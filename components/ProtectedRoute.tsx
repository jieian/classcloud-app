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
  match?: 'any' | 'all';
  loadingFallback?: ReactNode;
}

export default function ProtectedRoute({
  children,
  requiredPermissions,
  match = 'any',
  loadingFallback,
}: ProtectedRouteProps) {
  const { user, permissions, loading } = useAuth();
  const router = useRouter();
  const cachedPermissions =
    typeof window !== "undefined"
      ? (() => {
          try {
            const raw = localStorage.getItem("cc_permissions");
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed as string[] : [];
          } catch {
            return [];
          }
        })()
      : [];
  const effectivePermissions =
    permissions.length > 0 ? permissions : cachedPermissions;

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    const hasPermission =
      requiredPermissions.length === 0 ||
      (match === 'all'
        ? requiredPermissions.every((p) => effectivePermissions.includes(p))
        : requiredPermissions.some((p) => effectivePermissions.includes(p)));

    if (!hasPermission) {
      router.replace("/unauthorized");
    }
  }, [user, effectivePermissions, loading, requiredPermissions, match, router]);

  if (loading) {
    return loadingFallback ? (
      <>{loadingFallback}</>
    ) : (
      <Center h="60vh">
        <Loader size="md" />
      </Center>
    );
  }

  if (!user) return null;

  const hasPermission =
    requiredPermissions.length === 0 ||
    (match === 'all'
      ? requiredPermissions.every((p) => effectivePermissions.includes(p))
      : requiredPermissions.some((p) => effectivePermissions.includes(p)));

  if (!hasPermission) return null;

  return <>{children}</>;
}
