import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  WizardData,
  SectionWithAdviser,
  TeacherAssignment,
  SubjectForGradeLevel,
} from "./teachingLoadService";

export async function fetchWizardDataServer(facultyUid: string): Promise<WizardData> {
  const supabase = await createServerSupabaseClient();

  // Round 1: active SY + SY-independent data all in parallel
  const [
    { data: syData },
    { data: facultyRaw },
    { data: gradeLevelsRaw },
    { data: subjectGlRaw },
  ] = await Promise.all([
    supabase
      .from("school_years")
      .select("sy_id")
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("users")
      .select("uid, first_name, last_name")
      .eq("uid", facultyUid)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("grade_levels")
      .select("grade_level_id, level_number, display_name")
      .order("level_number"),
    supabase
      .from("subject_grade_levels")
      .select("grade_level_id, deleted_at, subjects(subject_id, name, code, section_type, deleted_at)")
      .is("deleted_at", null),
  ]);

  const activeSyId = syData?.sy_id ?? null;

  // Round 2: SY-dependent queries
  const [{ data: sectionsRaw }, { data: allAssignmentsRaw }] = await Promise.all([
    activeSyId
      ? supabase
          .from("sections")
          .select(
            "section_id, name, grade_level_id, sy_id, adviser_id, section_type, adviser:users!adviser_id(first_name, last_name, deleted_at)",
          )
          .eq("sy_id", activeSyId)
          .is("deleted_at", null)
          .order("name")
      : Promise.resolve({ data: [] }),
    activeSyId
      ? supabase
          .from("teacher_class_assignments")
          .select(
            "section_id, subject_id, teacher_id, teacher:users!teacher_id(first_name, last_name), subject:subjects!subject_id(section_type, deleted_at)",
          )
          .eq("sy_id", activeSyId)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);

  const sections: SectionWithAdviser[] = ((sectionsRaw ?? []) as any[]).map((s: any) => {
    const adviser = s.adviser as {
      first_name: string;
      last_name: string;
      deleted_at: string | null;
    } | null;
    const isOwnSection = s.adviser_id === facultyUid;
    const adviserIsActive = adviser !== null && adviser.deleted_at === null;
    return {
      section_id: s.section_id,
      name: s.name,
      grade_level_id: s.grade_level_id,
      sy_id: s.sy_id,
      adviser_id: !isOwnSection && !adviserIsActive ? null : s.adviser_id,
      section_type: s.section_type as "SSES" | "REGULAR",
      adviser_name:
        !isOwnSection && adviserIsActive
          ? `${adviser!.first_name} ${adviser!.last_name}`
          : null,
    };
  });

  const allAssignments: TeacherAssignment[] = ((allAssignmentsRaw ?? []) as any[])
    .filter((a: any) => {
      const subject = a.subject as { section_type: string; deleted_at: string | null } | null;
      return subject?.deleted_at === null;
    })
    .map((a: any) => {
      const teacher = a.teacher as { first_name: string; last_name: string } | null;
      return {
        section_id: a.section_id,
        subject_id: a.subject_id,
        teacher_id: a.teacher_id,
        teacher_name:
          a.teacher_id === facultyUid
            ? "You"
            : teacher
              ? `${teacher.first_name} ${teacher.last_name}`
              : "Unknown",
      };
    });

  const subjectsByGradeLevel: SubjectForGradeLevel[] = (
    (subjectGlRaw ?? []) as any[]
  ).flatMap((sgl: any) => {
    const raw = sgl.subjects;
    if (!raw) return [];
    const subjects = (Array.isArray(raw) ? raw : [raw]) as any[];
    return subjects
      .filter((s: any) => s.deleted_at === null)
      .map((s: any) => ({
        subject_id: s.subject_id,
        name: s.name,
        code: s.code,
        grade_level_id: sgl.grade_level_id,
        section_type: s.section_type as "SSES" | "REGULAR",
      }));
  });

  return {
    active_sy_id: activeSyId,
    faculty: facultyRaw
      ? {
          uid: facultyRaw.uid,
          first_name: facultyRaw.first_name,
          last_name: facultyRaw.last_name,
        }
      : null,
    grade_levels: (gradeLevelsRaw ?? []) as any[],
    sections,
    subjects_by_grade_level: subjectsByGradeLevel,
    all_assignments: allAssignments,
    current_advisory_section_id:
      sections.find((s) => s.adviser_id === facultyUid)?.section_id ?? null,
    current_teaching_assignments: (() => {
      const sectionTypeMap = new Map(sections.map((s) => [s.section_id, s.section_type]));
      return ((allAssignmentsRaw ?? []) as any[])
        .filter((a: any) => {
          if (a.teacher_id !== facultyUid) return false;
          const subject = a.subject as { section_type: string; deleted_at: string | null } | null;
          if (!subject || subject.deleted_at !== null) return false;
          return subject.section_type === sectionTypeMap.get(a.section_id);
        })
        .map((a: any) => ({ section_id: a.section_id, subject_id: a.subject_id }));
    })(),
  };
}
