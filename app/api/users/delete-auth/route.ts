import {
  createServerSupabaseClient,
  getPermissionsFromUser,
} from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { syncUserPermissions } from "@/lib/permissions-sync";
import { insertAuditLog } from "@/lib/audit";
import { sendAccountDeactivationEmail } from "@/lib/email/templates";
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
  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("users.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { uuid, soft, email, first_name } = await request.json();

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
    // Fetch profile for audit label before deletion
    const { data: profile } = await adminClient
      .from("users")
      .select("last_name")
      .eq("uid", uuid)
      .single();
    const entityLabel = first_name && profile?.last_name
      ? `${first_name} ${profile.last_name}`
      : uuid;

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

    // Clear JWT claims — user is banned but token still exists until expiry
    syncUserPermissions(uuid).catch((err) =>
      console.error("syncUserPermissions failed after soft-delete:", err),
    );

    insertAuditLog({
      actor_id: user.id,
      category: "ADMIN",
      action: "user_deleted",
      entity_type: "user",
      entity_id: uuid,
      entity_label: entityLabel,
    }).catch(() => {});

    if (email && first_name) {
      await sendAccountDeactivationEmail({
        to: email,
        firstName: first_name,
      }).catch((err) => console.error("Failed to send deactivation email:", err));
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
