import {
  createServerSupabaseClient,
  getPermissionsFromUser,
} from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { syncUserPermissions } from "@/lib/permissions-sync";
const _DELETE = async function(request: Request) {
  // 1. Verify the caller is authenticated
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Verify caller has the right to manage roles
  const permissions = getPermissionsFromUser(caller);
  if (!permissions.includes("roles.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Parse payload
  const body = await request.json();
  const { role_id } = body;

  if (!role_id || typeof role_id !== "number") {
    return Response.json({ error: "Missing or invalid role_id" }, { status: 400 });
  }

  // 5. Capture affected UIDs before deletion so we can sync them afterward
  const { data: affectedUsers } = await adminClient
    .from("user_roles")
    .select("uid")
    .eq("role_id", role_id);
  const affectedUids: string[] = (affectedUsers ?? []).map((r: { uid: string }) => r.uid);

  // 6. Atomic RPC — detach from user_roles then delete the role
  const { error } = await adminClient.rpc("delete_role_with_detach", {
    p_role_id: role_id,
  });

  if (error) {
    console.error("Role deletion failed:", error.message);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }

  // 7. Sync JWT claims for all previously affected users (non-fatal)
  if (affectedUids.length > 0) {
    Promise.all(affectedUids.map((uid) => syncUserPermissions(uid))).catch((err) =>
      console.error("syncUserPermissions failed after delete-role:", err),
    );
  }

  return Response.json({ success: true }, { status: 200 });
}

export const DELETE = withErrorHandler(_DELETE)
