import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { getActiveContext } from "@/lib/active-context";
import type {
  MasterlistGradeLevel,
  MasterlistSection,
  MasterlistSubject,
  MasterlistAssignment,
  MasterlistFacultyOption,
} from "@/app/(app)/school/faculty/_lib/masterlistService";

const _GET = async function () {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Round 1 — independent queries
  const [ctx, { data: gradeLevelsRaw }, { data: facultyRaw, error: facultyErr }] =
    await Promise.all([
      getActiveContext(),
      adminClient.from("grade_levels").select("grade_level_id, level_number, display_name").order("level_number"),
      adminClient.rpc("get_faculty_list"),
    ]);

  if (!ctx.sy_id) {
    return Response.json({
      grade_levels: [],
      assignments: [],
      faculty: [],
    });
  }

  if (facultyErr) {
    console.error("get_faculty_list error:", facultyErr.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  // Round 2 — need sy_id
  const [{ data: syRaw }, { data: sectionsRaw, error: sectionsErr }] = await Promise.all([
    adminClient
      .from("school_years")
      .select("curriculum_id")
      .eq("sy_id", ctx.sy_id)
      .is("deleted_at", null)
      .maybeSingle(),
    adminClient
      .from("sections")
      .select("section_id, name, section_type, adviser_id, grade_level_id")
      .eq("sy_id", ctx.sy_id)
      .is("deleted_at", null),
  ]);

  if (sectionsErr) {
    console.error("sections fetch error:", sectionsErr.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const curriculumId = (syRaw as any)?.curriculum_id ?? null;
  const sectionsData = (sectionsRaw ?? []) as {
    section_id: number;
    name: string;
    section_type: string;
    adviser_id: string | null;
    grade_level_id: number;
  }[];
  const sectionIds = sectionsData.map((s) => s.section_id);

  // Round 3 — need curriculum_id and section IDs
  const [{ data: csRaw, error: csErr }, { data: assignmentsRaw, error: assignErr }] =
    await Promise.all([
      curriculumId
        ? adminClient
            .from("curriculum_subjects")
            .select(
              "curriculum_subject_id, grade_level_id, subjects!inner(subject_id, name, code, subject_type, deleted_at)",
            )
            .eq("curriculum_id", curriculumId)
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null }),
      sectionIds.length > 0
        ? adminClient
            .from("teacher_class_assignments")
            .select("section_id, curriculum_subject_id, teacher_id")
            .in("section_id", sectionIds)
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (csErr) {
    console.error("curriculum_subjects fetch error:", csErr.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
  if (assignErr) {
    console.error("teacher_class_assignments fetch error:", assignErr.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  // Build subjects per grade level (filter soft-deleted subjects)
  const subjectsByGl = new Map<number, MasterlistSubject[]>();
  for (const cs of (csRaw ?? []) as any[]) {
    if (!cs.subjects || cs.subjects.deleted_at) continue;
    const subject: MasterlistSubject = {
      curriculum_subject_id: cs.curriculum_subject_id,
      code: cs.subjects.code,
      name: cs.subjects.name,
      subject_type: cs.subjects.subject_type as "BOTH" | "SSES",
    };
    const existing = subjectsByGl.get(cs.grade_level_id);
    if (existing) existing.push(subject);
    else subjectsByGl.set(cs.grade_level_id, [subject]);
  }

  // Sort subjects: BOTH alpha first, SSES alpha at end
  for (const subjects of subjectsByGl.values()) {
    subjects.sort((a, b) => {
      const aOrder = a.subject_type === "SSES" ? 1 : 0;
      const bOrder = b.subject_type === "SSES" ? 1 : 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.code.localeCompare(b.code);
    });
  }

  // Build sections per grade level
  const sectionsByGl = new Map<number, MasterlistSection[]>();
  for (const s of sectionsData) {
    const section: MasterlistSection = {
      section_id: s.section_id,
      name: s.name,
      section_type: s.section_type as "SSES" | "REGULAR",
      adviser_id: s.adviser_id,
    };
    const existing = sectionsByGl.get(s.grade_level_id);
    if (existing) existing.push(section);
    else sectionsByGl.set(s.grade_level_id, [section]);
  }

  // Sort sections: SSES first, then Regular, alpha within each group
  for (const sections of sectionsByGl.values()) {
    sections.sort((a, b) => {
      const aOrder = a.section_type === "SSES" ? 0 : 1;
      const bOrder = b.section_type === "SSES" ? 0 : 1;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name);
    });
  }

  // Compose grade levels (only those with sections)
  const grade_levels: MasterlistGradeLevel[] = ((gradeLevelsRaw ?? []) as any[])
    .filter((gl) => sectionsByGl.has(gl.grade_level_id))
    .map((gl) => ({
      grade_level_id: gl.grade_level_id,
      level_number: gl.level_number,
      display_name: gl.display_name,
      sections: sectionsByGl.get(gl.grade_level_id) ?? [],
      subjects: subjectsByGl.get(gl.grade_level_id) ?? [],
    }));

  const assignments: MasterlistAssignment[] = ((assignmentsRaw ?? []) as any[]).map((a) => ({
    section_id: a.section_id,
    curriculum_subject_id: a.curriculum_subject_id,
    teacher_id: a.teacher_id,
  }));

  // Faculty for dropdowns — map from get_faculty_list RPC shape
  const faculty: MasterlistFacultyOption[] = ((facultyRaw ?? []) as any[]).map((f: any) => ({
    uid: f.uid,
    first_name: f.first_name,
    last_name: f.last_name,
  }));

  return Response.json({ sy_id: ctx.sy_id, grade_levels, assignments, faculty });
};

export const GET = withErrorHandler(_GET);
