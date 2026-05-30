import { createServerSupabaseClient, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { fetchMyAssignedScope } from "@/lib/services/reportsAnalysisService";
import { getReportExamCardsCached } from "@/app/(app)/reports/_lib/reportServerService";

const _GET = async function () {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json([], { status: 401 });

  const permissions = getPermissionsFromUser(user);
  const canViewAll =
    permissions.includes("reports.view_all") || permissions.includes("reports.approve");
  const canViewAssigned = permissions.includes("reports.view_assigned");
  const canMonitorGradeLevel = permissions.includes("reports.monitor_grade_level");
  const canMonitorSubjects = permissions.includes("reports.monitor_subjects");

  if (!canViewAll && !canViewAssigned && !canMonitorGradeLevel && !canMonitorSubjects) {
    return Response.json([], { status: 403 });
  }

  const cards = await getReportExamCardsCached();
  if (canViewAll) return Response.json(cards);

  const scope = await fetchMyAssignedScope(user.id, adminClient);
  const filtered = cards.filter((card) => {
    if (canViewAssigned) {
      if (
        scope.assignedPairs.some(
          (p) =>
            p.sectionId === card.sectionId &&
            p.curriculumSubjectId === card.curriculumSubjectId,
        )
      )
        return true;
      if (scope.advisorySectionIds.includes(card.sectionId)) return true;
    }
    if (
      canMonitorGradeLevel &&
      scope.glSectionIds.includes(card.sectionId) &&
      scope.curriculumSubjectIds.includes(card.curriculumSubjectId)
    )
      return true;
    if (
      canMonitorSubjects &&
      scope.subjectSectionIds.includes(card.sectionId) &&
      scope.curriculumSubjectIds.includes(card.curriculumSubjectId)
    )
      return true;
    return false;
  });

  return Response.json(filtered);
};

export const GET = withErrorHandler(_GET);
