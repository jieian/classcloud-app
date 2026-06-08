import { getServerUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { getActiveContext } from "@/lib/active-context";

const _GET = async function () {
  const user = await getServerUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getActiveContext();
  if (!ctx.sy_id) {
    return Response.json({ hasIncomplete: false });
  }

  // Quick check 1: any section in active SY missing an adviser?
  const { data: noAdviser } = await adminClient
    .from("sections")
    .select("section_id")
    .eq("sy_id", ctx.sy_id)
    .is("adviser_id", null)
    .is("deleted_at", null)
    .limit(1);

  if (noAdviser && noAdviser.length > 0) {
    return Response.json({ hasIncomplete: true });
  }

  // Quick check 2: fetch active sections + curriculum to find unassigned teaching cells
  const [{ data: syRaw }, { data: sectionsRaw }] = await Promise.all([
    adminClient
      .from("school_years")
      .select("curriculum_id")
      .eq("sy_id", ctx.sy_id)
      .is("deleted_at", null)
      .maybeSingle(),
    adminClient
      .from("sections")
      .select("section_id, section_type, grade_level_id")
      .eq("sy_id", ctx.sy_id)
      .is("deleted_at", null),
  ]);

  const curriculumId = (syRaw as any)?.curriculum_id ?? null;
  const sections = (sectionsRaw ?? []) as { section_id: number; section_type: string; grade_level_id: number }[];
  const sectionIds = sections.map((s) => s.section_id);

  if (!curriculumId || sectionIds.length === 0) {
    return Response.json({ hasIncomplete: false });
  }

  const [{ data: csRaw }, { data: assignmentsRaw }] = await Promise.all([
    adminClient
      .from("curriculum_subjects")
      .select(
        "curriculum_subject_id, grade_level_id, subjects!inner(subject_type, deleted_at)",
      )
      .eq("curriculum_id", curriculumId)
      .is("deleted_at", null),
    adminClient
      .from("teacher_class_assignments")
      .select("section_id, curriculum_subject_id")
      .in("section_id", sectionIds)
      .is("deleted_at", null),
  ]);

  // Build assigned set for O(1) lookup
  const assignedSet = new Set(
    ((assignmentsRaw ?? []) as any[]).map(
      (a) => `${a.section_id}:${a.curriculum_subject_id}`,
    ),
  );

  // Build section lookup maps
  const sectionTypeMap = new Map(sections.map((s) => [s.section_id, s.section_type]));
  const sectionGlMap = new Map(sections.map((s) => [s.section_id, s.grade_level_id]));

  // Check each applicable cell — subject must match the section's grade level
  for (const cs of (csRaw ?? []) as any[]) {
    if (cs.subjects?.deleted_at) continue;
    const subjectType: string = cs.subjects?.subject_type ?? "BOTH";

    for (const sectionId of sectionIds) {
      if (sectionGlMap.get(sectionId) !== cs.grade_level_id) continue;
      const sectionType = sectionTypeMap.get(sectionId);
      const isApplicable = subjectType === "BOTH" || sectionType === "SSES";
      if (!isApplicable) continue;
      if (!assignedSet.has(`${sectionId}:${cs.curriculum_subject_id}`)) {
        return Response.json({ hasIncomplete: true });
      }
    }
  }

  return Response.json({ hasIncomplete: false });
};

export const GET = withErrorHandler(_GET);
