import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ReactNode } from "react";

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
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user is not logged in
  if (!user) redirect("/login");

  // Fetch permissions using the UID stored in users.id
  const { data, error } = await supabase.rpc("get_user_permissions", {
    user_uuid: user.id,
  });

  if (error) {
    console.error("Error fetching permissions:", error);
    redirect("/error");
  }

  const permissions = data as UserPermission[];
  const userPermissions = permissions?.map((p) => p.permission_name) || [];

  const hasPermission = requiredPermissions.every((p) =>
    userPermissions.includes(p),
  );

  // If user does not have required permission
  if (!hasPermission) redirect("/unauthorized");

  return <>{children}</>;
}
