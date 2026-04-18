import {
  createServerSupabaseClient,
  getPermissionsFromUser,
} from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
const _POST = async function(request: Request) {
  // 1. SECURITY: Verify the caller is authenticated
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. PERMISSIONS: Verify caller has the right to manage roles
  const permissions = getPermissionsFromUser(caller);
  if (!permissions.includes("roles.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. PAYLOAD: Parse role data
  const body = await request.json();
  const { name, is_faculty, permission_ids } = body;

  if (!name || is_faculty === undefined || !permission_ids || !Array.isArray(permission_ids)) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // 5. RPC: Create role + assign permissions in a single atomic transaction
  const { data, error } = await adminClient.rpc(
    "create_role_with_permissions",
    {
      role_name: name.trim(),
      p_is_faculty: is_faculty,
      p_ids: permission_ids,
    }
  );

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { error: "A role with this name already exists." },
        { status: 409 }
      );
    }
    console.error("Role Creation Failed:", error.message);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }

  return Response.json({ success: true, role_id: data }, { status: 201 });
}

export const POST = withErrorHandler(_POST)
