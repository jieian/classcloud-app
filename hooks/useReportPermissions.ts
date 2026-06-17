"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchMyAssignedScope, type AssignedScope } from "@/lib/services/reportsAnalysisService";

export type ReportPermissionScope = {
  canViewAll: boolean;
  canViewAssigned: boolean;
  canMonitorGradeLevel: boolean;
  canMonitorSubjects: boolean;
  hasAnyReportAccess: boolean;
  assignedScope: AssignedScope | null;
  scopeLoading: boolean;
};

export function useReportPermissions(): ReportPermissionScope {
  const { user, permissions } = useAuth();

  const canViewAll = permissions.includes("reports.view_all");
  const canViewAssigned = permissions.includes("reports.view_assigned");
  const canMonitorGradeLevel = permissions.includes("reports.monitor_grade_level");
  const canMonitorSubjects = permissions.includes("reports.monitor_subjects");
  const hasAnyReportAccess =
    canViewAll || canViewAssigned || canMonitorGradeLevel || canMonitorSubjects;

  // Tracks the fetched scope alongside the user it belongs to, so loading state
  // and the scope itself can be derived (no synchronous setState in the effect).
  const [fetched, setFetched] = useState<{
    userId: string | null;
    scope: AssignedScope | null;
  }>({ userId: null, scope: null });

  useEffect(() => {
    if (!hasAnyReportAccess || !user?.id) return;
    let cancelled = false;
    fetchMyAssignedScope(user.id).then((scope) => {
      if (!cancelled) setFetched({ userId: user.id, scope });
    });
    return () => {
      cancelled = true;
    };
  }, [hasAnyReportAccess, user?.id]);

  // Scope is current only when the fetched result matches the active user.
  const scopeReady =
    !hasAnyReportAccess || !user?.id || fetched.userId === user.id;
  const scopeLoading = !scopeReady;
  const assignedScope =
    user?.id != null && fetched.userId === user.id ? fetched.scope : null;

  return {
    canViewAll,
    canViewAssigned,
    canMonitorGradeLevel,
    canMonitorSubjects,
    hasAnyReportAccess,
    assignedScope,
    scopeLoading,
  };
}

export function isSectionInScope(
  sectionId: number,
  gradeLevelId: number,
  scope: ReportPermissionScope,
): boolean {
  if (scope.canViewAll || !scope.assignedScope) return true;
  const { sectionIds, glSectionIds, subjectSectionIds, advisorySectionIds } =
    scope.assignedScope;
  return (
    // Advisers see every subject in their advisory section, regardless of who
    // teaches it (advisory is part of view_assigned). Mirrors the server-side
    // check in app/api/reports/exam-cards/route.ts.
    (scope.canViewAssigned && advisorySectionIds.includes(sectionId)) ||
    (scope.canViewAssigned && sectionIds.includes(sectionId)) ||
    (scope.canMonitorGradeLevel && glSectionIds.includes(sectionId)) ||
    (scope.canMonitorSubjects && subjectSectionIds.includes(sectionId))
  );
}

export function isSubjectInScope(
  subjectId: number,
  scope: ReportPermissionScope,
): boolean {
  if (scope.canViewAll || !scope.assignedScope) return true;
  const { subjectIds } = scope.assignedScope;
  const hasAnyLimitedPermission =
    scope.canViewAssigned || scope.canMonitorGradeLevel || scope.canMonitorSubjects;
  return hasAnyLimitedPermission && subjectIds.includes(subjectId);
}

export function isPairInScope(
  sectionId: number,
  curriculumSubjectId: number,
  scope: ReportPermissionScope,
): boolean {
  if (scope.canViewAll || !scope.assignedScope) return true;
  const {
    assignedPairs,
    glSectionIds,
    curriculumSubjectIds,
    subjectSectionIds,
    advisorySectionIds,
  } = scope.assignedScope;
  return (
    // An adviser may view any subject taught in their advisory section, so the
    // pair is in scope as soon as the section is one they advise.
    (scope.canViewAssigned && advisorySectionIds.includes(sectionId)) ||
    (scope.canViewAssigned &&
      assignedPairs.some(
        (p) => p.sectionId === sectionId && p.curriculumSubjectId === curriculumSubjectId,
      )) ||
    (scope.canMonitorGradeLevel &&
      glSectionIds.includes(sectionId) &&
      curriculumSubjectIds.includes(curriculumSubjectId)) ||
    (scope.canMonitorSubjects &&
      subjectSectionIds.includes(sectionId) &&
      curriculumSubjectIds.includes(curriculumSubjectId))
  );
}
