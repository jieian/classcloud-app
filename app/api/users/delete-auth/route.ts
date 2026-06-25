import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { eraseUserAccount } from "@/lib/services/userErasure";
import { redis } from "@/lib/redis";
const _DELETE = async function(request: Request) {
  // Verify the caller is authenticated
  const user = await getServerUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the caller has user management permissions
  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("users.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { uuid, soft } = await request.json();

  if (!uuid || typeof uuid !== "string") {
    return Response.json({ error: "Invalid user UUID" }, { status: 400 });
  }

  // Prevent self-deletion
  if (uuid === user.id) {
    return Response.json(
      { error: "Cannot delete your own account" },
      { status: 403 },
    );
  }

  if (soft) {
    // Permanent erasure via the shared helper (claim → scrub public+auth → notify → audit).
    // It also reconciles any open account_deletion_request for this user to APPROVED, so a
    // direct delete of a user with a pending request never orphans that request.
    const result = await eraseUserAccount(uuid, user.id, { notify: "direct" });
    if (!result.ok) {
      return Response.json({ error: "Internal server error." }, { status: 500 });
    }
    return Response.json({ success: true });
  }

  // Hard delete — used for rejecting pending (never-activated) users
  const { error } = await adminClient.auth.admin.deleteUser(uuid);

  if (error) {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  await redis.del("users:pending");
  return Response.json({ success: true });
}

export const DELETE = withErrorHandler(_DELETE)
