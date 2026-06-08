/**
 * DELETE /api/schoolYear/hard-delete/[syId]
 *
 * Permanently deletes a school year from the database.
 * Relies on ON DELETE CASCADE constraints for child tables (quarters, sections,
 * enrollments, subject_coordinators, exam_results_reports, item_analysis_reports).
 * Only allowed when no exams exist for this school year's quarters.
 * Requires "school_year.full_access" permission.
 *
 * New RPC (run once in Supabase SQL editor):
 * -----------------------------------------------------------------------
 * CREATE OR REPLACE FUNCTION delete_school_year_permanent(p_sy_id INT)
 * RETURNS jsonb
 * LANGUAGE plpgsql
 * SECURITY DEFINER
 * SET search_path = public
 * AS $$
 * BEGIN
 *   IF EXISTS (
 *     SELECT 1 FROM exams e
 *     JOIN quarters q ON q.quarter_id = e.quarter_id
 *     WHERE q.sy_id = p_sy_id
 *   ) THEN
 *     RETURN jsonb_build_object('success', false, 'code', 'HAS_EXAMS');
 *   END IF;
 *
 *   DELETE FROM school_years WHERE sy_id = p_sy_id;
 *
 *   RETURN jsonb_build_object('success', true);
 * END;
 * $$;
 * -----------------------------------------------------------------------
 */

import { revalidateTag } from "next/cache";
import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { SCHOOL_YEARS_CACHE_TAG } from "@/app/(app)/school/classes/_lib/classesServerService";
import { ACTIVE_CONTEXT_CACHE_TAG } from "@/lib/services/homeServerService";
import { invalidateActiveContext } from "@/lib/active-context";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";

const _DELETE = async function (
  _request: Request,
  { params }: { params: Promise<{ syId: string }> },
) {
  const caller = await getServerUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!getPermissionsFromUser(caller).includes("school_year.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { syId } = await params;
  const sy_id = parseInt(syId, 10);

  if (isNaN(sy_id)) {
    return Response.json({ error: "Invalid school year ID" }, { status: 400 });
  }

  const { data, error } = await adminClient.rpc("delete_school_year_permanent", {
    p_sy_id: sy_id,
  });

  if (error) {
    console.error("School year permanent delete failed:", error.message);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
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
    console.error("active-context cache invalidation failed (hard-delete):", err),
  );
  revalidateTag(SCHOOL_YEARS_CACHE_TAG, "minutes");
  revalidateTag(ACTIVE_CONTEXT_CACHE_TAG, "minutes");
  revalidateTag("subjects", "minutes");

  return Response.json({ success: true }, { status: 200 });
};

export const DELETE = withErrorHandler(_DELETE);
