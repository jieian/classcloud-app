import { getServerUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";

// ─── GET /api/me/teaching-assignments ─────────────────────────────────────────
// The caller's own active teaching assignments (all school years, matching the
// previous client-side query exactly). Replaces the browser-direct PostgREST
// read in classService.fetchTeacherClassAssignments — and removes the ability
// to query another user's assignments, since the uid now comes from the
// session instead of a parameter.

type RawAssignment = {
  section_id: number;
  curriculum_subject_id: number;
  curriculum_subjects:
    | { subject_id: number }
    | { subject_id: number }[]
    | null;
};

const _GET = async function () {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await admin
    .from("teacher_class_assignments")
    .select("section_id, curriculum_subject_id, curriculum_subjects!inner(subject_id)")
    .eq("teacher_id", user.id)
    .is("deleted_at", null);

  if (error)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  const assignments = ((data ?? []) as RawAssignment[]).map((r) => {
    const cs = Array.isArray(r.curriculum_subjects)
      ? r.curriculum_subjects[0]
      : r.curriculum_subjects;
    return {
      section_id: r.section_id,
      curriculum_subject_id: r.curriculum_subject_id,
      subject_id: cs?.subject_id ?? 0,
    };
  });

  return Response.json({ assignments });
};

export const GET = withErrorHandler(_GET);
