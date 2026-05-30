import type { ReportMonitoringTree } from "./reportsAnalysisService";

export const REPORTS_BROWSER_STORAGE_PREFIX = "reports:browser";

export const emptyTree: ReportMonitoringTree = {
  assigned: { advisorySections: [], handledSections: [] },
  gradeMonitoring: [],
  subjectGroupMonitoring: [],
  allMonitoring: { gradeLevels: [], subjectGroups: [] },
};

export function makeReportsStorageKey(
  userId: string | undefined,
  key: string,
): string | null {
  return userId ? `${REPORTS_BROWSER_STORAGE_PREFIX}:${userId}:${key}` : null;
}

export function makeReportsTreeScopeKey(reportScope: {
  canViewAll: boolean;
  canViewAssigned: boolean;
  canMonitorGradeLevel: boolean;
  canMonitorSubjects: boolean;
}): string {
  return (
    [
      reportScope.canViewAll ? "all" : "",
      reportScope.canViewAssigned ? "assigned" : "",
      reportScope.canMonitorGradeLevel ? "grade" : "",
      reportScope.canMonitorSubjects ? "subjects" : "",
    ]
      .filter(Boolean)
      .join("-") || "none"
  );
}

export function isReportMonitoringTree(
  value: unknown,
): value is ReportMonitoringTree {
  if (value == null || typeof value !== "object") return false;
  const tree = value as Partial<ReportMonitoringTree>;
  return (
    tree.assigned != null &&
    typeof tree.assigned === "object" &&
    Array.isArray(tree.assigned.advisorySections) &&
    Array.isArray(tree.assigned.handledSections) &&
    Array.isArray(tree.gradeMonitoring) &&
    Array.isArray(tree.subjectGroupMonitoring) &&
    tree.allMonitoring != null &&
    typeof tree.allMonitoring === "object" &&
    Array.isArray(tree.allMonitoring.gradeLevels) &&
    Array.isArray(tree.allMonitoring.subjectGroups)
  );
}

export function readStoredReportsState<T>(
  storageKey: string | null,
  fallback: T,
  validate: (value: unknown) => value is T,
): T {
  if (!storageKey || typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    return validate(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export async function fetchReportMonitoringTreeFromApi(): Promise<ReportMonitoringTree> {
  const response = await fetch("/api/reports/monitoring-tree", {
    credentials: "include",
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error((result as { error?: string })?.error ?? "Failed to load reports.");
  }
  return result as ReportMonitoringTree;
}
