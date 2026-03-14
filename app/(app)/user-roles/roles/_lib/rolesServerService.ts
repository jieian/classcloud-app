import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { RoleWithPermissions } from "../../users/_lib";

export async function fetchRolesWithPermissionsServer(): Promise<RoleWithPermissions[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("roles")
    .select("role_id, name, is_faculty, role_permissions(permissions(permission_id, name, description))")
    .order("name");

  if (error) {
    console.error("Error fetching roles with permissions:", error);
    return [];
  }

  return (data || []).map((role: any) => ({
    role_id: role.role_id,
    name: role.name,
    is_faculty: role.is_faculty ?? false,
    permissions: (role.role_permissions || []).map((rp: any) => rp.permissions),
  }));
}
