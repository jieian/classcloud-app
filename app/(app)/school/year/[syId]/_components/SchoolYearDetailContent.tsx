import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import SchoolYearDetailClient, {
  type SchoolYearDetail,
} from "./SchoolYearDetailClient";

interface Props {
  syId: string;
}

export default async function SchoolYearDetailContent({ syId }: Props) {
  const sy_id = parseInt(syId, 10);
  if (isNaN(sy_id)) notFound();

  // Round 1 — base data
  const [syResult, quartersResult, sectionsResult, coordinatorsResult] =
    await Promise.all([
      adminClient
        .from("school_years")
        .select(
          "sy_id, year_range, start_year, end_year, is_active, curriculum_id, curriculums(name)",
        )
        .eq("sy_id", sy_id)
        .is("deleted_at", null)
        .single(),

      adminClient
        .from("quarters")
        .select("quarter_id, name, is_active, sy_id")
        .eq("sy_id", sy_id)
        .order("quarter_id", { ascending: true }),

      adminClient
        .from("sections")
        .select(
          "section_id, name, section_type, grade_levels(grade_level_id, display_name), users!adviser_id(uid, first_name, last_name)",
        )
        .eq("sy_id", sy_id)
        .is("deleted_at", null),

      adminClient
        .from("subject_coordinators")
        .select(
          `sc_id, subject_group_id,
           subject_groups(subject_group_id, name,
             subject_group_members(
               curriculum_subject_id,
               curriculum_subjects!inner(subjects!inner(code, name, subject_type))
             )
           ),
           users!user_id(uid, first_name, last_name)`,
        )
        .eq("sy_id", sy_id)
        .is("deleted_at", null),
    ]);

  if (syResult.error || !syResult.data) notFound();

  const sy = syResult.data as any;
  const quarters = (quartersResult.data ?? []) as any[];
  const rawSections = (sectionsResult.data ?? []) as any[];
  const rawCoordinators = (coordinatorsResult.data ?? []) as any[];

  const sectionIds = rawSections.map((s: any) => s.section_id as number);
  const quarterIds = quarters.map((q: any) => q.quarter_id as number);

  // Round 2 — dependent data
  const [assignmentsResult, examCountResult] = await Promise.all([
    sectionIds.length > 0
      ? adminClient
          .from("teacher_class_assignments")
          .select(
            "section_id, curriculum_subject_id, users!teacher_id(uid, first_name, last_name), curriculum_subjects(curriculum_subject_id, subjects(code, name, subject_type))",
          )
          .in("section_id", sectionIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),

    quarterIds.length > 0
      ? adminClient
          .from("exams")
          .select("exam_id", { count: "exact", head: true })
          .in("quarter_id", quarterIds)
      : Promise.resolve({ count: 0 }),
  ]);

  const rawAssignments = ((assignmentsResult as any).data ?? []) as any[];
  const hasExams = ((examCountResult as any).count ?? 0) > 0;

  // Shape coordinators
  const coordinators: SchoolYearDetail["coordinators"] = rawCoordinators.map(
    (sc: any) => {
      const sg = sc.subject_groups;
      const members = (sg?.subject_group_members ?? []).map((m: any) => ({
        curriculum_subject_id: m.curriculum_subject_id as number,
        code: (m.curriculum_subjects?.subjects?.code ?? "") as string,
        name: (m.curriculum_subjects?.subjects?.name ?? "") as string,
      }));
      return {
        sc_id: sc.sc_id as number,
        subject_group_id: sc.subject_group_id as number,
        subject_group_name: (sg?.name ?? "") as string,
        members,
        coordinator_name: sc.users
          ? `${sc.users.first_name} ${sc.users.last_name}`
          : null,
      };
    },
  );

  // Build assignment lookup: section_id → curriculum_subject_id → teacher_name
  const assignmentMap = new Map<number, Map<number, string | null>>();
  for (const a of rawAssignments) {
    if (!assignmentMap.has(a.section_id)) {
      assignmentMap.set(a.section_id, new Map());
    }
    const teacherName = a.users
      ? `${a.users.first_name} ${a.users.last_name}`
      : null;
    assignmentMap.get(a.section_id)!.set(a.curriculum_subject_id, teacherName);
  }

  // Shape grade levels
  const gradeLevelMap = new Map<
    number,
    SchoolYearDetail["grade_levels"][number]
  >();

  for (const section of rawSections) {
    const gl = section.grade_levels;
    if (!gl) continue;
    const glId = gl.grade_level_id as number;

    if (!gradeLevelMap.has(glId)) {
      gradeLevelMap.set(glId, {
        grade_level_id: glId,
        name: gl.display_name as string,
        display_name: gl.display_name as string,
        subjects: [],
        sections: [],
      });
    }

    const glEntry = gradeLevelMap.get(glId)!;

    const sectionAssignments = rawAssignments.filter(
      (a: any) => a.section_id === section.section_id,
    );
    for (const a of sectionAssignments) {
      const cs = a.curriculum_subjects;
      if (
        cs &&
        !glEntry.subjects.find(
          (s) => s.curriculum_subject_id === a.curriculum_subject_id,
        )
      ) {
        glEntry.subjects.push({
          curriculum_subject_id: a.curriculum_subject_id as number,
          code: (cs.subjects?.code ?? "") as string,
          name: (cs.subjects?.name ?? "") as string,
          subject_type: (cs.subjects?.subject_type ?? "BOTH") as string,
        });
      }
    }

    const sectionTeacherMap =
      assignmentMap.get(section.section_id) ?? new Map();

    glEntry.sections.push({
      section_id: section.section_id as number,
      name: section.name as string,
      section_type: section.section_type as string,
      adviser_name: section.users
        ? `${section.users.first_name} ${section.users.last_name}`
        : null,
      assignments: Array.from(sectionTeacherMap.entries()).map(
        ([cs_id, teacher_name]) => ({
          curriculum_subject_id: cs_id,
          teacher_name,
        }),
      ),
    });
  }

  const detail: SchoolYearDetail = {
    sy_id: sy.sy_id as number,
    year_range: sy.year_range as string,
    start_year: sy.start_year as number,
    end_year: sy.end_year as number,
    is_active: sy.is_active as boolean,
    curriculum_id: sy.curriculum_id as number,
    curriculum_name: (sy.curriculums as any)?.name ?? "—",
    quarters: quarters.map((q: any) => ({
      quarter_id: q.quarter_id as number,
      name: q.name as string,
      is_active: q.is_active as boolean,
      sy_id: q.sy_id as number,
    })),
    coordinators,
    grade_levels: Array.from(gradeLevelMap.values()).sort(
      (a, b) => a.grade_level_id - b.grade_level_id,
    ),
    hasExams,
  };

  return <SchoolYearDetailClient detail={detail} />;
}
