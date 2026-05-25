import pLimit from "p-limit";
import { adminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis";

/** Max simultaneous Admin API calls during a bulk sync. */
const BULK_CONCURRENCY = 5;
/** Pause between batches to avoid overwhelming the Auth admin API. */
const INTER_BATCH_DELAY_MS = 200;
const BATCH_SIZE = 10;

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
  // Retries handle transient rate limits or network blips on the admin API.
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await adminClient.auth.admin.updateUserById(uid, {
      app_metadata: { permissions, roles },
    });
    if (!error) { lastError = undefined; break; }
    lastError = error;
    await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
  }
  if (lastError) throw lastError;

  // Best-effort: cache a timestamp version in Redis for fast client polling.
  // Using Date.now() (ms epoch) keeps the version space compatible with the
  // Supabase updated_at fallback used by /api/auth/permissions-version.
  try {
    await redis.set(`permissions:version:${uid}`, Date.now(), { ex: 30 * 24 * 3600 });
  } catch (err) {
    console.warn("Redis unavailable — permissions version not cached:", err);
  }

  // Best-effort: signal the connected client to refresh their session immediately.
  // Fallback polling will recover any missed signals (e.g. client offline, WS drop).
  try {
    await adminClient
      .channel(`permissions:${uid}`)
      .httpSend("invalidated", {});
  } catch (err) {
    console.warn(`Realtime broadcast failed for uid ${uid}:`, err);
  }
}

/**
 * Syncs permissions for an arbitrary list of UIDs.
 *
 * Uses p-limit to cap concurrent Admin API calls and adds a short pause
 * between batches so a large role change doesn't overwhelm the Auth service.
 * Safe to call from after() — errors are logged, never thrown.
 */
export async function syncUsersBatch(uids: string[]): Promise<void> {
  if (uids.length === 0) return;

  const limit = pLimit(BULK_CONCURRENCY);
  const failed: string[] = [];

  for (let i = 0; i < uids.length; i += BATCH_SIZE) {
    const batch = uids.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((uid) => limit(() => syncUserPermissions(uid))),
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const uid = batch[index];
        console.error(`syncUserPermissions failed for uid ${uid}:`, result.reason);
        failed.push(uid);
      }
    });

    // Breathe between batches to avoid rate-limiting the Auth admin API.
    if (i + BATCH_SIZE < uids.length) {
      await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
    }
  }

  if (failed.length > 0) {
    console.error(
      `syncUsersBatch: ${failed.length}/${uids.length} failed — UIDs: ${failed.join(", ")}`,
    );
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

  const uids = data.map((row: { uid: string }) => row.uid);
  await syncUsersBatch(uids);
}
