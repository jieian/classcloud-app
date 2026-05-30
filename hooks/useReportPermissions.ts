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

  const [assignedScope, setAssignedScope] = useState<AssignedScope | null>(null);
  const [scopeLoading, setScopeLoading] = useState(hasAnyReportAccess);

  useEffect(() => {
    if (!hasAnyReportAccess || !user?.id) {
      setScopeLoading(false);
      return;
    }
    setScopeLoading(true);
    fetchMyAssignedScope(user.id)
      .then(setAssignedScope)
      .finally(() => setScopeLoading(false));
  }, [hasAnyReportAccess, user?.id]);

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
  const { sectionIds, glSectionIds, subjectSectionIds } = scope.assignedScope;
  return (
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
  const { assignedPairs, glSectionIds, curriculumSubjectIds, subjectSectionIds } = scope.assignedScope;
  return (
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
