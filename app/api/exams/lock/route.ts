import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { revalidateTag } from "next/cache";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { EXAMS_CACHE_TAG } from "@/app/(app)/exam/_lib/examServerService";

// POST /api/exams/lock — toggle an exam's open/closed (is_locked) state.
// The exams table is SELECT-only for the `authenticated` role under RLS, so this
// write must go through the service-role admin client (a browser-direct UPDATE
// is silently denied). The status toggle is an admin-only action.
const _POST = async function (request: Request) {
  const user = await getServerUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("exams.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const examId = Number(body?.exam_id);
  const isLocked = body?.is_locked;

  if (!Number.isInteger(examId) || examId <= 0) {
    return Response.json({ error: "Invalid exam_id." }, { status: 400 });
  }
  if (typeof isLocked !== "boolean") {
    return Response.json({ error: "Invalid is_locked." }, { status: 400 });
  }

  const { data, error } = await adminClient
    .from("exams")
    .update({ is_locked: isLocked })
    .eq("exam_id", examId)
    .is("deleted_at", null)
    .select("exam_id, is_locked");

  if (error) {
    console.error("[api/exams/lock] update error:", error.message);
    return Response.json({ error: "Failed to update exam status." }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return Response.json({ error: "Exam not found." }, { status: 404 });
  }

  revalidateTag(EXAMS_CACHE_TAG, "minutes");

  return Response.json({ success: true, is_locked: isLocked }, { status: 200 });
};

export const POST = withErrorHandler(_POST);
