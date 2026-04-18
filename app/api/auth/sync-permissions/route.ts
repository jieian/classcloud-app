import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { syncUserPermissions } from "@/lib/permissions-sync";

/**
 * POST /api/auth/sync-permissions
 *
 * Called by the client when app_metadata.permissions is empty after login —
 * meaning this user predates the JWT-claims system and has never been synced.
 *
 * Writes current DB roles/permissions into app_metadata so the next
 * supabase.auth.refreshSession() returns a JWT with the correct claims.
 */
const _POST = async function (_request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await syncUserPermissions(user.id);

  return Response.json({ success: true });
};

export const POST = withErrorHandler(_POST);
