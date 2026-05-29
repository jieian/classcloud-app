import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { fetchReportMonitoringTree } from "@/lib/services/reportsAnalysisService";

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

  const tree = await fetchReportMonitoringTree(
    user.id,
    {
      canViewAssigned: true,
      canMonitorGradeLevel: true,
      canMonitorSubjects: true,
      canViewAll: false,
    },
    adminClient,
  );

  const advisorySections = tree.assigned.advisorySections.map((s) => ({
    gradeDisplayName: s.gradeDisplayName,
    sectionName: s.sectionName,
  }));

  const subjectMap = new Map<
    string,
    { gradeDisplayName: string; sectionName: string }[]
  >();
  for (const section of tree.assigned.handledSections) {
    for (const row of section.rows) {
      if (!subjectMap.has(row.subjectName)) {
        subjectMap.set(row.subjectName, []);
      }
      subjectMap.get(row.subjectName)!.push({
        gradeDisplayName: row.gradeDisplayName,
        sectionName: row.sectionName,
      });
    }
  }
  const handledSubjects = Array.from(subjectMap.entries()).map(
    ([subjectName, sections]) => ({ subjectName, sections }),
  );

  const gradeSubjectLeader = tree.gradeMonitoring.flatMap((g) =>
    g.subjects.map((s) => ({
      gradeDisplayName: g.gradeDisplayName,
      subjectName: s.subjectName,
    })),
  );

  const subjectCoordinator = tree.subjectGroupMonitoring.map((g) => ({
    subjectGroupName: g.subjectGroupName,
  }));

  const result: ProfileAssignmentsResponse = {
    advisorySections,
    handledSubjects,
    gradeSubjectLeader,
    subjectCoordinator,
  };

  return Response.json(result);
};

export const GET = withErrorHandler(_GET);
