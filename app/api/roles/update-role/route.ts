import { createServerSupabaseClient } from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
const _PUT = async function(request: Request) {
  // 1. SECURITY: Verify the caller is authenticated
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. PERMISSIONS: Verify caller has the right to manage roles
  const { data: permsData, error: permsError } = await adminClient.rpc("get_user_permissions", {
    user_uuid: caller.id,
  });

  if (permsError || !permsData?.some((p: any) => p.permission_name === "roles.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 4. PAYLOAD: Parse role data
  const body = await request.json();
  const { role_id, name, is_faculty, permission_ids } = body;

  if (!role_id || !name || is_faculty === undefined || !permission_ids || !Array.isArray(permission_ids)) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // 5. RPC: Update role + reassign permissions in a single atomic transaction
  const { error } = await adminClient.rpc("update_role_and_permissions", {
    p_role_id: role_id,
    p_name: name.trim(),
    p_is_faculty: is_faculty,
    p_permission_ids: permission_ids,
  });

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { error: "A role with this name already exists." },
        { status: 409 }
      );
    }
    console.error("Role Update Failed:", error.message);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }

  return Response.json({ success: true }, { status: 200 });
}

export const PUT = withErrorHandler(_PUT)
