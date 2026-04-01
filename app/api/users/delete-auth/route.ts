import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
const _DELETE = async function(request: Request) {
  // Verify the caller is authenticated
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the caller has user management permissions
  const permissions = await getUserPermissions(user.id);
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
    // Soft delete: atomically clean up assignments/roles and stamp deleted_at
    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      "soft_delete_user_atomic",
      { p_uid: uuid },
    );

    if (rpcError) {
      return Response.json({ error: "Internal server error." }, { status: 500 });
    }

    if (!rpcResult?.success) {
      return Response.json(
        { error: rpcResult?.message ?? "User not found or already deleted" },
        { status: 404 },
      );
    }

    // Ban for ~100 years — effectively permanent until explicitly restored
    const { error: banError } = await adminClient.auth.admin.updateUserById(
      uuid,
      { ban_duration: "876000h" },
    );

    if (banError) {
      return Response.json({ error: "Internal server error." }, { status: 500 });
    }

    return Response.json({ success: true });
  }

  // Hard delete — used for rejecting pending (never-activated) users
  const { error } = await adminClient.auth.admin.deleteUser(uuid);

  if (error) {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  return Response.json({ success: true });
}

export const DELETE = withErrorHandler(_DELETE)
