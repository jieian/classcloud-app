import { getSupabase } from "@/lib/supabase/client";

export interface Permission {
  permission_id: number;
  name: string;
  description: string;
}

export interface Role {
  role_id: number;
  name: string;
}

export interface RoleWithPermissions {
  role_id: number;
  name: string;
  permissions: Permission[];
}

export interface User {
  uid: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  active_status: number;
}

export interface UserWithRoles {
  uid: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  roles: Role[];
}

export interface PendingUser {
  uid: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
}

export async function fetchPendingUserCount(): Promise<number> {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("active_status", 0);

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error fetching pending user count:", error);
    }
    throw error;
  }

  return count ?? 0;
}

/** Returns true if the value looks like a real name (letters/spaces only) */
function isValidName(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && /^[a-zA-Z\s]+$/.test(value.trim());
}

/**
 * Fetches pending users with email from auth.users via RPC.
 */
export async function fetchPendingUsers(): Promise<PendingUser[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("get_pending_users");

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error fetching pending users:", error);
    }
    throw error;
  }

  return (data || []).map((user: any) => ({
    ...user,
    middle_name: isValidName(user.middle_name) ? user.middle_name : undefined,
  }));
}

/**
 * Checks if an email is already in use in auth.users via RPC.
 * Returns true if the email is taken.
 * Pass excludeUid to ignore a specific user (for edit scenarios).
 */
export async function checkEmailExists(
  email: string,
  excludeUid?: string,
): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("check_email_exists", {
    p_email: email.trim(),
    p_exclude_uid: excludeUid ?? null,
  });

  if (error) {
    console.error("Error checking email uniqueness:", error);
    throw new Error("Failed to verify email availability.");
  }

  return data === true;
}

/**
 * Fetches active users with email (from auth.users) and roles via RPC.
 */
export async function fetchActiveUsersWithRoles(): Promise<UserWithRoles[]> {
  const supabase = getSupabase();
  try {
    const startTime = performance.now();

    const { data, error } = await supabase.rpc("get_active_users_with_roles");

    const queryTime = performance.now() - startTime;

    if (process.env.NODE_ENV === "development") {
      console.log(`[Performance] Users query took ${queryTime.toFixed(2)}ms`);
    }

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching users with roles:", error);
      }
      throw error;
    }

    const usersWithRoles: UserWithRoles[] = (data || []).map((user: any) => ({
      uid: user.uid,
      first_name: user.first_name,
      middle_name: isValidName(user.middle_name) ? user.middle_name : undefined,
      last_name: user.last_name,
      email: user.email,
      roles: (user.roles || []) as Role[],
    }));

    if (process.env.NODE_ENV === "development") {
      console.log(`[Performance] Total time: ${queryTime.toFixed(2)}ms`);
      console.log(`[Performance] Fetched ${usersWithRoles.length} users`);
    }

    return usersWithRoles;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Failed to fetch users:", error);
    }
    throw error;
  }
}

/**
 * Fetches all available roles
 */
export async function fetchAllRoles(): Promise<
  Array<{ role_id: number; name: string }>
> {
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from("roles")
      .select("role_id, name")
      .order("name");

    if (error) {
      console.error("Error fetching roles:", error);
      throw new Error(
        "Failed to load roles. Please refresh the page and try again."
      );
    }

    return data || [];
  } catch (error) {
    console.error("Failed to fetch roles:", error);

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("An unexpected error occurred while loading roles.");
  }
}

/**
 * Fetches all roles with their assigned permissions via join table.
 */
export async function fetchRolesWithPermissions(): Promise<RoleWithPermissions[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("roles")
    .select("role_id, name, role_permissions(permissions(permission_id, name, description))")
    .order("name");

  if (error) {
    console.error("Error fetching roles with permissions:", error);
    throw new Error("Failed to load roles.");
  }

  return (data || []).map((role: any) => ({
    role_id: role.role_id,
    name: role.name,
    permissions: (role.role_permissions || []).map((rp: any) => rp.permissions),
  }));
}

/**
 * Fetches all available permissions.
 */
export async function fetchAllPermissions(): Promise<Permission[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("permissions")
    .select("permission_id, name, description")
    .order("name");

  if (error) {
    console.error("Error fetching permissions:", error);
    throw new Error("Failed to load permissions.");
  }

  return data || [];
}

/**
 * Checks if a role name already exists (case-insensitive).
 * Pass excludeRoleId to ignore a specific role (for edit scenarios).
 */
export async function checkRoleNameExists(
  name: string,
  excludeRoleId?: number,
): Promise<boolean> {
  const supabase = getSupabase();
  let query = supabase
    .from("roles")
    .select("role_id", { count: "exact", head: true })
    .ilike("name", name.trim());

  if (excludeRoleId) {
    query = query.neq("role_id", excludeRoleId);
  }

  const { count, error } = await query;

  if (error) {
    console.error("Error checking role name:", error);
    throw new Error("Failed to verify role name availability.");
  }

  return (count ?? 0) > 0;
}

/**
 * Creates a new role with permissions via the secure API route.
 * The API handles auth, permission checks, and rollback.
 */
export async function createRole(
  name: string,
  permissionIds: number[],
): Promise<void> {
  const response = await fetch("/api/roles/create-role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, permission_ids: permissionIds }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to create role.");
  }
}

/**
 * Deletes a role and its permission assignments via the secure API route.
 * The API handles auth, permission checks, and uses the admin client.
 */
export async function deleteRole(roleId: number): Promise<void> {
  const response = await fetch("/api/roles/delete-role", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role_id: roleId }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to delete role.");
  }
}

export async function isRoleAttached(roleId: number): Promise<boolean> {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("user_roles")
    .select("*", { count: "exact", head: true })
    .eq("role_id", roleId);

  if (error) {
    throw new Error("Failed to check role attachment status.");
  }

  return (count ?? 0) > 0;
}

/**
 * Updates a role's name and permissions via the secure API route.
 * The API handles auth, permission checks, and uses the admin client.
 */
export async function updateRole(
  roleId: number,
  name: string,
  permissionIds: number[],
): Promise<void> {
  const response = await fetch("/api/roles/update-role", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role_id: roleId, name, permission_ids: permissionIds }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to update role.");
  }
}
