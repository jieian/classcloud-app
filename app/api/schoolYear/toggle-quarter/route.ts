/**
 * POST /api/schoolYear/toggle-quarter
 *
 * Switches the active quarter within a school year.
 * Validates that all teacher-subject-section combos have submitted exam
 * results reports for the currently active quarter before switching.
 * Requires "school_year.full_access" permission.
 *
 * New RPC (run once in Supabase SQL editor):
 * -----------------------------------------------------------------------
 * CREATE OR REPLACE FUNCTION toggle_quarter(p_quarter_id INT, p_sy_id INT)
 * RETURNS jsonb
 * LANGUAGE plpgsql
 * SECURITY DEFINER
 * SET search_path = public
 * AS $$
 * DECLARE
 *   v_active_quarter_id INT;
 *   v_incomplete_count  INT;
 * BEGIN
 *   SELECT quarter_id INTO v_active_quarter_id
 *   FROM quarters WHERE sy_id = p_sy_id AND is_active = true;
 *
 *   IF v_active_quarter_id = p_quarter_id THEN
 *     RETURN jsonb_build_object('success', true);
 *   END IF;
 *
 *   IF v_active_quarter_id IS NOT NULL THEN
 *     SELECT COUNT(*) INTO v_incomplete_count
 *     FROM teacher_class_assignments tca
 *     JOIN sections s ON s.section_id = tca.section_id
 *     WHERE s.sy_id = p_sy_id AND s.deleted_at IS NULL AND tca.deleted_at IS NULL
 *       AND NOT EXISTS (
 *         SELECT 1 FROM exam_results_reports r
 *         WHERE r.section_id = tca.section_id
 *           AND r.curriculum_subject_id = tca.curriculum_subject_id
 *           AND r.quarter_id = v_active_quarter_id
 *       );
 *
 *     IF v_incomplete_count > 0 THEN
 *       RETURN jsonb_build_object('success', false, 'code', 'REPORTS_INCOMPLETE');
 *     END IF;
 *   END IF;
 *
 *   UPDATE quarters SET is_active = false WHERE sy_id = p_sy_id;
 *   UPDATE quarters SET is_active = true  WHERE quarter_id = p_quarter_id AND sy_id = p_sy_id;
 *
 *   RETURN jsonb_build_object('success', true);
 * END;
 * $$;
 * -----------------------------------------------------------------------
 */

import { revalidateTag } from "next/cache";
import { createServerSupabaseClient, getPermissionsFromUser } from "@/lib/supabase/server";
import { SCHOOL_YEARS_CACHE_TAG } from "@/app/(app)/school/classes/_lib/classesServerService";
import { ACTIVE_CONTEXT_CACHE_TAG } from "@/lib/services/homeServerService";
import { invalidateActiveContext } from "@/lib/active-context";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";

const _POST = async function (request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!getPermissionsFromUser(caller).includes("school_year.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { quarter_id, sy_id } = body;

  if (quarter_id == null || sy_id == null) {
    return Response.json(
      { error: "Missing required fields: quarter_id, sy_id" },
      { status: 400 },
    );
  }

  // Guard: prevent going backward to a previous term
  const { data: allQuarters, error: quartersError } = await adminClient
    .from("quarters")
    .select("quarter_id, is_active")
    .eq("sy_id", sy_id)
    .order("quarter_id", { ascending: true });

  if (quartersError || !allQuarters) {
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }

  const activeIdx = allQuarters.findIndex((q) => q.is_active);
  const targetIdx = allQuarters.findIndex((q) => q.quarter_id === quarter_id);

  if (targetIdx !== -1 && activeIdx !== -1 && targetIdx < activeIdx) {
    return Response.json({ error: "BACKWARD_TERM" }, { status: 400 });
  }

  const { data, error } = await adminClient.rpc("toggle_quarter", {
    p_quarter_id: quarter_id,
    p_sy_id: sy_id,
  });

  if (error) {
    console.error("Quarter toggle failed:", error.message);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }

  const result = data as { success: boolean; code?: string };

  if (!result.success) {
    if (result.code === "REPORTS_INCOMPLETE") {
      return Response.json({ error: "REPORTS_INCOMPLETE" }, { status: 400 });
    }
    return Response.json({ error: "Toggle failed" }, { status: 500 });
  }

  await invalidateActiveContext().catch((err) =>
    console.error("active-context cache invalidation failed (toggle-quarter):", err),
  );
  revalidateTag(SCHOOL_YEARS_CACHE_TAG, "minutes");
  revalidateTag(ACTIVE_CONTEXT_CACHE_TAG, "minutes");

  return Response.json({ success: true }, { status: 200 });
};

export const POST = withErrorHandler(_POST);
