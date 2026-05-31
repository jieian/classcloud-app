import { createServerSupabaseClient, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { syncAllUsersWithRole } from "@/lib/permissions-sync";

// TEMPORARY — delete after use. Syncs JWT claims for all users holding the given roles.
// POST /api/auth/sync-roles  body: { role_ids: number[] }
const _POST = async function (request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !getPermissionsFromUser(user).includes("roles.full_access")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { role_ids } = await request.json();
  if (!Array.isArray(role_ids) || role_ids.length === 0) {
    return Response.json({ error: "role_ids must be a non-empty array" }, { status: 400 });
  }

  await Promise.all(role_ids.map((id: number) => syncAllUsersWithRole(id)));

  return Response.json({ success: true, synced_roles: role_ids });
};

export const POST = withErrorHandler(_POST);
