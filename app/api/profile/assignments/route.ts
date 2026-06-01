import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { getUserAssignmentsContext } from "@/lib/services/userAssignmentsCache";

export interface ProfileAssignmentsResponse {
  advisorySections: { gradeDisplayName: string; sectionName: string }[];
  handledSubjects: {
    subjectName: string;
    sections: { gradeDisplayName: string; sectionName: string }[];
  }[];
  gradeSubjectLeader: { gradeDisplayName: string; subjectName: string }[];
  subjectCoordinator: { subjectGroupName: string }[];
}

const _GET = async function () {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getUserAssignmentsContext(user.id);

  const advisorySections = ctx.advisorySections.map((s) => ({
    gradeDisplayName: s.grade_display_name,
    sectionName: s.name,
  }));

  // Group teaching assignments by subject name
  const subjectMap = new Map<string, { gradeDisplayName: string; sectionName: string }[]>();
  for (const a of ctx.teachingAssignments) {
    if (!subjectMap.has(a.subject_name)) subjectMap.set(a.subject_name, []);
    subjectMap.get(a.subject_name)!.push({
      gradeDisplayName: a.grade_display_name,
      sectionName: a.section_name,
    });
  }
  const handledSubjects = Array.from(subjectMap.entries()).map(([subjectName, sections]) => ({
    subjectName,
    sections,
  }));

  const gradeSubjectLeader = ctx.gsl
    ? [{ gradeDisplayName: ctx.gsl.grade_display_name, subjectName: ctx.gsl.subject_name }]
    : [];

  const subjectCoordinator = ctx.coordinator
    ? [{ subjectGroupName: ctx.coordinator.subject_group_name }]
    : [];

  const result: ProfileAssignmentsResponse = {
    advisorySections,
    handledSubjects,
    gradeSubjectLeader,
    subjectCoordinator,
  };

  return Response.json(result);
};

export const GET = withErrorHandler(_GET);
