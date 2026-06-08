import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { getReportExamCardsCached } from "@/app/(app)/reports/_lib/reportServerService";
import { getAssignedScopeForUser } from "@/lib/services/userAssignmentsCache";

const _GET = async function () {
  const user = await getServerUser();
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

  const scope = await getAssignedScopeForUser(user.id, {
    needsGlSections: canMonitorGradeLevel,
    needsSubjectSections: canMonitorSubjects,
  });

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
