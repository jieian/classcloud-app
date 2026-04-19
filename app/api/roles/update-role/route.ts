import { createServerSupabaseClient, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { syncAllUsersWithRole } from "@/lib/permissions-sync";
import { insertAuditLog } from "@/lib/audit";

const _PUT = async function (request: Request) {
  // 1. Auth
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Permissions
  if (!getPermissionsFromUser(caller).includes("roles.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Payload
  const body = await request.json();
  const { role_id, name, permission_ids } = body;
  const is_faculty: boolean = body.is_faculty ?? false;
  const is_self_registerable: boolean = body.is_self_registerable ?? false;

  if (
    !role_id ||
    !name ||
    !permission_ids ||
    !Array.isArray(permission_ids)
  ) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // 4. Fetch old values for audit (non-fatal if it fails)
  const { data: oldRole } = await adminClient
    .from("roles")
    .select("name, is_faculty, is_self_registerable")
    .eq("role_id", role_id)
    .single();

  // 5. RPC: Update role + reassign permissions atomically
  const { error } = await adminClient.rpc("update_role_and_permissions", {
    p_role_id: role_id,
    p_name: name.trim(),
    p_is_faculty: is_faculty,
    p_is_self_registerable: is_self_registerable,
    p_permission_ids: permission_ids,
  });

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { error: "A role with this name already exists." },
        { status: 409 },
      );
    }
    console.error("Role Update Failed:", error.message);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }

  // 6. Sync JWT claims for all users holding this role (non-fatal)
  syncAllUsersWithRole(role_id).catch((err) =>
    console.error("syncAllUsersWithRole failed after update-role:", err),
  );

  // 7. Audit
  await insertAuditLog({
    actor_id: caller.id,
    category: "ADMIN",
    action: "role_updated",
    entity_type: "role",
    entity_id: String(role_id),
    entity_label: name.trim(),
    old_values: oldRole ?? null,
    new_values: {
      name: name.trim(),
      is_faculty,
      is_self_registerable,
      permission_ids,
    },
  });

  return Response.json({ success: true }, { status: 200 });
};

export const PUT = withErrorHandler(_PUT);
