import { adminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis";

interface Role {
  role_id: number;
  name: string;
}

/**
 * Fetches a user's current permissions and roles from the DB, writes them to
 * app_metadata (JWT claims), and increments their permissions version key in
 * Redis so polling clients know to refresh their session.
 *
 * Call this after any operation that changes user_roles or role_permissions
 * for a specific user.
 */
export async function syncUserPermissions(uid: string): Promise<void> {
  const [permsResult, rolesResult] = await Promise.all([
    adminClient.rpc("get_user_permissions", { user_uuid: uid }),
    adminClient
      .from("user_roles")
      .select("roles(role_id, name)")
      .eq("uid", uid),
  ]);

  const permissions: string[] = (permsResult.data ?? []).map(
    (p: { permission_name: string }) => p.permission_name,
  );

  const roles: Role[] = ((rolesResult.data ?? []) as any[])
    .map((r) => r.roles)
    .filter(Boolean);

  // Critical: update JWT claims (source of truth)
  await adminClient.auth.admin.updateUserById(uid, {
    app_metadata: { permissions, roles },
  });

  // Best-effort: cache a timestamp version in Redis for fast client polling.
  // Using Date.now() (ms epoch) keeps the version space compatible with the
  // Supabase updated_at fallback used by /api/auth/permissions-version.
  try {
    await redis.set(`permissions:version:${uid}`, Date.now());
  } catch (err) {
    console.warn("Redis unavailable — permissions version not cached:", err);
  }
}

/**
 * Re-syncs permissions for every user that currently holds the given role.
 *
 * Call this after a role's permissions are changed (update) or the role is
 * deleted (capture UIDs before deletion, then call this).
 */
export async function syncAllUsersWithRole(roleId: number): Promise<void> {
  const { data } = await adminClient
    .from("user_roles")
    .select("uid")
    .eq("role_id", roleId);

  if (!data || data.length === 0) return;

  await Promise.all(data.map((row: { uid: string }) => syncUserPermissions(row.uid)));
}
