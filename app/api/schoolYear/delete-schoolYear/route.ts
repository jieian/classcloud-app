/**
 * DELETE /api/schoolYear/delete-schoolYear
 *
 * Permanently deletes a school year via the delete_school_year_permanent() RPC
 * (hard DELETE; ON DELETE CASCADE removes quarters, sections, enrollments,
 * subject_coordinators, exam_results_reports, item_analysis_reports, scores, etc.).
 * Rejected with HAS_EXAMS (409) when any exam is attached to the SY's quarters.
 * Requires the caller to have the "school_year.full_access" permission.
 */

import { revalidateTag } from "next/cache";
import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { SCHOOL_YEARS_CACHE_TAG } from "@/app/(app)/school/classes/_lib/classesServerService";
import { ACTIVE_CONTEXT_CACHE_TAG } from "@/lib/services/homeServerService";
import { invalidateActiveContext } from "@/lib/active-context";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { after } from "next/server";
import { auditFromRpc } from "@/lib/audit";
const _DELETE = async function(request: Request) {
  // 1. Verify the caller is authenticated
  const caller = await getServerUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3. Permission check
  if (!getPermissionsFromUser(caller).includes("school_year.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 4. Parse payload
  const body = await request.json();
  const { sy_id } = body;

  if (sy_id == null) {
    return Response.json({ error: "Missing required field: sy_id" }, { status: 400 });
  }

  // 5. Permanent delete via RPC (CASCADE). Returns { success, code?, _audit? }.
  const { data, error } = await adminClient.rpc("delete_school_year_permanent", {
    p_sy_id: sy_id,
  });

  if (error) {
    console.error("School year delete failed:", error.message);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }

  const result = data as { success: boolean; code?: string };
  if (!result.success) {
    if (result.code === "HAS_EXAMS") {
      return Response.json(
        { error: "Cannot delete a school year that has exams attached." },
        { status: 409 },
      );
    }
    return Response.json({ error: "Delete failed" }, { status: 500 });
  }

  await invalidateActiveContext().catch((err) =>
    console.error("active-context cache invalidation failed (delete):", err),
  );
  revalidateTag(SCHOOL_YEARS_CACHE_TAG, "minutes");
  revalidateTag(ACTIVE_CONTEXT_CACHE_TAG, "minutes");
  revalidateTag("subjects", "minutes");

  after(() =>
    auditFromRpc(
      { actor_id: caller.id, action: "school_year_deleted", entity_type: "school_year", entity_id: String(sy_id) },
      (data as { _audit?: Parameters<typeof auditFromRpc>[1] } | null)?._audit,
    ),
  );

  return Response.json({ success: true }, { status: 200 });
}

export const DELETE = withErrorHandler(_DELETE)
