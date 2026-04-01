/**
 * DELETE /api/schoolYear/delete-schoolYear
 *
 * Soft-deletes a school year (sets deleted_at = NOW(), is_active = false)
 * and inactivates all its quarters in a single atomic transaction.
 * Requires the caller to have the "school_year.full_access" permission.
 *
 * RPC SQL (run once in Supabase SQL editor):
 * -----------------------------------------------------------------------
 * CREATE OR REPLACE FUNCTION delete_school_year(p_sy_id int4)
 * RETURNS void
 * LANGUAGE plpgsql
 * SECURITY DEFINER
 * SET search_path = public
 * AS $$
 * BEGIN
 *   -- Inactivate all quarters belonging to this school year
 *   UPDATE quarters
 *   SET is_active = false
 *   WHERE sy_id = p_sy_id;
 *
 *   -- Soft-delete the school year and mark it inactive
 *   UPDATE school_years
 *   SET is_active  = false,
 *       deleted_at = NOW()
 *   WHERE sy_id = p_sy_id;
 * END;
 * $$;
 * -----------------------------------------------------------------------
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
const _DELETE = async function(request: Request) {
  // 1. Verify the caller is authenticated
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3. Permission check
  const { data: permsData, error: permsError } = await adminClient.rpc(
    "get_user_permissions",
    { user_uuid: caller.id },
  );

  if (
    permsError ||
    !permsData?.some(
      (p: any) => p.permission_name === "school_year.full_access",
    )
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 4. Parse payload
  const body = await request.json();
  const { sy_id } = body;

  if (sy_id == null) {
    return Response.json({ error: "Missing required field: sy_id" }, { status: 400 });
  }

  // 5. Atomic soft-delete via RPC
  const { error } = await adminClient.rpc("delete_school_year", {
    p_sy_id: sy_id,
  });

  if (error) {
    console.error("School year delete failed:", error.message);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }

  return Response.json({ success: true }, { status: 200 });
}

export const DELETE = withErrorHandler(_DELETE)
