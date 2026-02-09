/**
 * Protected Route Component
 * Server Component that checks permissions before rendering
 * Uses new @supabase/ssr utilities
 */

import { redirect } from "next/navigation";
import { ReactNode } from "react";
import { createServerSupabaseClient, getUserPermissions } from "@/lib/supabase/server";

type UserPermission = {
  permission_name: string;
};

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermissions: string[];
}

export default async function ProtectedRoute({
  children,
  requiredPermissions,
}: ProtectedRouteProps) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user is not logged in
  if (!user) redirect("/login");

  // Fetch permissions using centralized server utility
  const userPermissions = await getUserPermissions(user.id);

  const hasPermission = requiredPermissions.every((p) =>
    userPermissions.includes(p),
  );

  // If user does not have required permission
  if (!hasPermission) redirect("/unauthorized");

  return <>{children}</>;
}
