import { createServerSupabaseClient, getPermissionsFromUser } from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
type SaveObjectivesBody = {
  examId?: number;
  objectives?: { objective: string; start_item: number; end_item: number }[];
};

const _POST = async function(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("exams.limited_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as SaveObjectivesBody;
  const { examId, objectives } = body;

  if (!examId || !objectives) {
    return Response.json({ error: "Missing examId or objectives" }, { status: 400 });
  }

  // Verify the user is assigned to a section this exam belongs to
  const { data: assignments, error: assignmentError } = await adminClient
    .from("exam_assignments")
    .select("section_id")
    .eq("exam_id", examId);

  if (assignmentError) {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const examSectionIds = (assignments ?? []).map((a: { section_id: number }) => a.section_id);

  if (examSectionIds.length > 0) {
    const { count } = await adminClient
      .from("teacher_class_assignments")
      .select("section_id", { count: "exact", head: true })
      .eq("teacher_id", user.id)
      .in("section_id", examSectionIds)
      .is("deleted_at", null);

    if ((count ?? 0) === 0) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data, error } = await adminClient
    .from("exams")
    .update({ objectives })
    .eq("exam_id", examId)
    .select("exam_id");

  if (error) {
    console.error("[api/exams/objectives] update error:", error.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return Response.json({ error: "No exam rows updated" }, { status: 404 });
  }

  return Response.json({ exam_id: data[0].exam_id });
}

export const POST = withErrorHandler(_POST)
