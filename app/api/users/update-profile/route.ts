import { createServerSupabaseClient, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { syncUserPermissions } from "@/lib/permissions-sync";
import { insertAuditLog } from "@/lib/audit";

const _PATCH = async function (request: Request) {
  // 1. Verify caller is authenticated
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Verify caller has user management permission
  const permissions = getPermissionsFromUser(caller);
  if (!permissions.includes("users.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Parse payload
  const body = await request.json();
  const { uid, first_name, middle_name, last_name, role_ids } = body;

  if (
    !uid ||
    typeof uid !== "string" ||
    !first_name?.trim() ||
    !last_name?.trim() ||
    !Array.isArray(role_ids)
  ) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // 4. Update profile + roles atomically (RPC returns old values for audit)
  const { data: result, error: rpcError } = await adminClient.rpc(
    "update_user_atomic",
    {
      p_uid: uid,
      p_first_name: first_name.trim(),
      p_middle_name: middle_name?.trim() ?? "",
      p_last_name: last_name.trim(),
      p_role_ids: role_ids,
    },
  );

  if (rpcError) {
    if (rpcError.message.includes("not found")) {
      return Response.json(
        { error: "User not found. Please refresh and try again." },
        { status: 404 },
      );
    }
    console.error("update_user_atomic failed:", rpcError.message);
    return Response.json({ error: "Failed to update user." }, { status: 500 });
  }

  if (!result?.success) {
    return Response.json(
      { error: "Update operation did not complete successfully." },
      { status: 500 },
    );
  }

  // 5. Sync JWT claims + Redis version (non-fatal)
  syncUserPermissions(uid).catch((err) =>
    console.error("syncUserPermissions failed after update-profile:", err),
  );

  insertAuditLog({
    actor_id: caller.id,
    category: "ADMIN",
    action: "user_edited",
    entity_type: "user",
    entity_id: uid,
    entity_label: `${first_name} ${last_name}`,
    old_values: {
      first_name: result.old_first_name,
      middle_name: result.old_middle_name ?? null,
      last_name: result.old_last_name,
      role_ids: result.old_role_ids ?? [],
    },
    new_values: { first_name, middle_name, last_name, role_ids },
  }).catch(() => {});

  return Response.json({ success: true });
};

export const PATCH = withErrorHandler(_PATCH);
