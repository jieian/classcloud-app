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

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermissions: string[];
}

export default function ProtectedRoute({
  children,
  requiredPermissions,
}: ProtectedRouteProps) {
  const { user, permissions, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push("/login");
      return;
    }

    const hasPermission = requiredPermissions.every((p) =>
      permissions.includes(p),
    );

    if (!hasPermission) {
      router.push("/unauthorized");
    }
  }, [user, permissions, loading, requiredPermissions, router]);

  if (loading) return null;

  if (!user) return null;

  const hasPermission = requiredPermissions.every((p) =>
    permissions.includes(p),
  );

  if (!hasPermission) return null;

  return <>{children}</>;
}
