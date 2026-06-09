"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Box, Collapse, Group, SegmentedControl, Select, Skeleton, Stack, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronDown, IconChevronUp, IconExternalLink } from "@tabler/icons-react";
import { useAuth } from "@/context/AuthContext";
import type {
  ReportMonitoringCoordinatorGroup,
  ReportMonitoringGradeGroup,
  ReportMonitoringSectionGroup,
  ReportMonitoringSubjectGroup,
  ReportMonitoringTree,
} from "@/lib/services/reportsAnalysisService";
import {
  emptyTree,
  fetchReportMonitoringTreeFromApi,
  isReportMonitoringTree,
  makeReportsStorageKey,
  makeReportsTreeScopeKey,
  readStoredReportsState,
} from "@/lib/services/reportsMonitoringCache";
import {
  EllipsisTooltip,
  getRowStatusCounts,
  getSubjectSubgroupStatusCounts,
  StatusCircle,
} from "../reports/_components/ReportsShared";
import styles from "./HomeReportsSection.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportSegment = "assigned" | "grade" | "subject-group" | "all";
type AssignedView = "advisory" | "subjects";

const SEGMENT_LABELS: Record<ReportSegment, string> = {
  assigned: "My Advisory & Subjects",
  grade: "Grade Subject",
  "subject-group": "Subject Group",
  all: "Reports Monitoring",
};

const reportSegmentedStyles = {
  root: {
    backgroundColor: "#ffffff",
    border: "1px solid #D6D9E0",
    padding: 3,
  },
  label: {
    fontWeight: 500,
    fontSize: "clamp(11px, 2.5vw, 13px)",
    padding: "3px 8px",
    whiteSpace: "nowrap" as const,
  },
};

// ─── Row renderers (exact AdvisoryList / SubjectMonitoringList style) ──────────

function SectionRow({ section }: { section: ReportMonitoringSectionGroup }) {
  const label = `${section.gradeDisplayName} • ${section.sectionName}`;
  return (
    <Group
      align="center"
      wrap="nowrap"
      px="sm"
      py="xs"
      className="rounded-lg border border-[#E5E7EB] bg-white"
    >
      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
        <StatusCircle counts={getRowStatusCounts(section.rows)} label={label} />
        <EllipsisTooltip label={label} position="top-start" withArrow>
          <Text fw={700} size="md" truncate="end" maw={260}>
            {section.gradeDisplayName}{" • "}{section.sectionName}
          </Text>
        </EllipsisTooltip>
      </Group>
    </Group>
  );
}

function SubjectRow({
  subject,
  showGrade,
}: {
  subject: ReportMonitoringSubjectGroup;
  showGrade: boolean;
}) {
  const label = showGrade
    ? `${subject.gradeDisplayName} • ${subject.subjectName}`
    : subject.subjectName;
  return (
    <Box style={{ border: "1px solid #D6D9E0", borderRadius: 6, backgroundColor: "#ffffff", overflow: "hidden" }}>
      <Box px={14} py={10} style={{ minWidth: 0 }}>
        <Group wrap="nowrap" style={{ minWidth: 0 }}>
          <StatusCircle counts={getRowStatusCounts(subject.rows)} label={label} />
          <EllipsisTooltip label={label} position="top-start" withArrow>
            <Text fw={700} size="md" truncate="end" maw={220}>{label}</Text>
          </EllipsisTooltip>
        </Group>
      </Box>
    </Box>
  );
}

function SubjectGroupRow({ group }: { group: ReportMonitoringCoordinatorGroup }) {
  return (
    <Box style={{ border: "1px solid #D6D9E0", borderRadius: 6, backgroundColor: "#ffffff", overflow: "hidden" }}>
      <Box px={14} py={10} style={{ minWidth: 0 }}>
        <Group wrap="nowrap" style={{ minWidth: 0 }}>
          <StatusCircle counts={getSubjectSubgroupStatusCounts(group.subjects)} label={group.subjectGroupName} />
          <EllipsisTooltip label={group.subjectGroupName} position="top-start" withArrow>
            <Text fw={700} size="md" truncate="end" maw={220}>{group.subjectGroupName}</Text>
          </EllipsisTooltip>
        </Group>
      </Box>
    </Box>
  );
}

// ─── Segment content ──────────────────────────────────────────────────────────

function AdvisoryContent({ sections }: { sections: ReportMonitoringSectionGroup[] }) {
  if (sections.length === 0)
    return <Text size="sm" c="dimmed" ta="center" py="md">No advisory reports found.</Text>;
  return (
    <Stack gap="xs">
      {sections.map((s) => <SectionRow key={s.sectionId} section={s} />)}
    </Stack>
  );
}

function HandledSubjectsContent({ sections }: { sections: ReportMonitoringSectionGroup[] }) {
  const subjectGroups = useMemo<ReportMonitoringSubjectGroup[]>(() => {
    const map = new Map<number, ReportMonitoringSubjectGroup>();
    for (const section of sections) {
      for (const row of section.rows) {
        if (!map.has(row.curriculumSubjectId)) {
          map.set(row.curriculumSubjectId, {
            curriculumSubjectId: row.curriculumSubjectId,
            subjectId: row.subjectId,
            subjectName: row.subjectName,
            subjectType: row.subjectType,
            gradeLevelId: row.gradeLevelId,
            gradeDisplayName: row.gradeDisplayName,
            gradeLevelNumber: row.gradeLevelNumber ?? null,
            leaderName: null,
            rows: [],
          });
        }
        map.get(row.curriculumSubjectId)!.rows.push(row);
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.subjectName.localeCompare(b.subjectName, undefined, { sensitivity: "base" }),
    );
  }, [sections]);

  if (subjectGroups.length === 0)
    return <Text size="sm" c="dimmed" ta="center" py="md">No assigned subjects found.</Text>;
  return (
    <Stack gap="xs">
      {subjectGroups.map((s) => <SubjectRow key={s.curriculumSubjectId} subject={s} showGrade={false} />)}
    </Stack>
  );
}

function GradeContent({ grades }: { grades: ReportMonitoringGradeGroup[] }) {
  const sorted = [...grades.flatMap((g) => g.subjects)].sort(
    (a, b) => (a.gradeLevelNumber ?? 99) - (b.gradeLevelNumber ?? 99) || a.subjectName.localeCompare(b.subjectName),
  );
  if (sorted.length === 0)
    return <Text size="sm" c="dimmed" ta="center" py="md">No grade subject data found.</Text>;
  return (
    <Stack gap="xs">
      {sorted.map((s) => <SubjectRow key={s.curriculumSubjectId} subject={s} showGrade={true} />)}
    </Stack>
  );
}

function SubjectGroupContent({ groups }: { groups: ReportMonitoringCoordinatorGroup[] }) {
  if (groups.length === 0)
    return <Text size="sm" c="dimmed" ta="center" py="md">No subject groups found.</Text>;
  return (
    <Stack gap="xs">
      {groups.map((g) => <SubjectGroupRow key={g.subjectGroupId} group={g} />)}
    </Stack>
  );
}

function AllMonitoringContent({ tree }: { tree: ReportMonitoringTree }) {
  const groups = tree.allMonitoring.subjectGroups;
  if (groups.length === 0)
    return <Text size="sm" c="dimmed" ta="center" py="md">No monitoring data found.</Text>;
  return (
    <Stack gap="xs">
      {groups.map((g) => <SubjectGroupRow key={g.subjectGroupId} group={g} />)}
    </Stack>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <Stack gap="xs">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} height={52} radius={6} />
      ))}
    </Stack>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HomeReportsSection() {
  const { user, permissions } = useAuth();

  const canViewAll = permissions.includes("reports.view_all");
  const canViewAssigned = permissions.includes("reports.view_assigned");
  const canMonitorGradeLevel = permissions.includes("reports.monitor_grade_level");
  const canMonitorSubjects = permissions.includes("reports.monitor_subjects");
  const hasAnyReportAccess = canViewAll || canViewAssigned || canMonitorGradeLevel || canMonitorSubjects;


  const segments = useMemo<ReportSegment[]>(() => {
    const s: ReportSegment[] = [];
    if (canViewAll) s.push("all");
    if (canViewAssigned) s.push("assigned");
    if (canMonitorGradeLevel) s.push("grade");
    if (canMonitorSubjects) s.push("subject-group");
    return s;
  }, [canViewAll, canViewAssigned, canMonitorGradeLevel, canMonitorSubjects]);

  const [activeSegment, setActiveSegment] = useState<ReportSegment | null>(null);
  const [assignedView, setAssignedView] = useState<AssignedView>("advisory");
  const [collapsed, setCollapsed] = useState(true);
  const [tree, setTree] = useState<ReportMonitoringTree>(emptyTree);
  const [loading, setLoading] = useState(true);
  const [hasRequested, setHasRequested] = useState(false);

  // Set default segment once permissions resolve
  useEffect(() => {
    if (segments.length > 0 && activeSegment === null) {
      setActiveSegment(segments[0]);
    }
  }, [segments, activeSegment]);

  // Lazy-load: only fetch the (heavy) monitoring tree once the section is
  // actually expanded. The home page renders it collapsed by default, so most
  // loads shouldn't pay for it at all. sessionStorage still gives instant
  // display on re-expand, and we fetch at most once per mount.
  useEffect(() => {
    if (collapsed || hasRequested) return;
    if (!user?.id || !hasAnyReportAccess) return;
    setHasRequested(true);

    const scopeKey = makeReportsTreeScopeKey({ canViewAll, canViewAssigned, canMonitorGradeLevel, canMonitorSubjects });
    const storageKey = makeReportsStorageKey(user.id, `tree:${scopeKey}`);
    const cached = readStoredReportsState(storageKey, emptyTree, isReportMonitoringTree);
    const hasCached = cached !== emptyTree;

    if (hasCached) {
      setTree(cached);
      setLoading(false);
    }

    fetchReportMonitoringTreeFromApi()
      .then((fresh) => {
        setTree(fresh);
        if (storageKey && typeof window !== "undefined") {
          window.sessionStorage.setItem(storageKey, JSON.stringify(fresh));
        }
      })
      .catch(() => {/* silently fall back to cached */})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, hasRequested, user?.id, canViewAll, canViewAssigned, canMonitorGradeLevel, canMonitorSubjects]);

  // Auto-switch inner tab to whichever side has data
  useEffect(() => {
    const hasAdvisory = tree.assigned.advisorySections.length > 0;
    const hasHandled = tree.assigned.handledSections.length > 0;
    if (!hasAdvisory && hasHandled) setAssignedView("subjects");
    else if (hasAdvisory) setAssignedView("advisory");
  }, [tree.assigned]);

  // Must be called before any early return (Rules of Hooks)
  const isMobile = useMediaQuery("(max-width: 768px)");

  if (!hasAnyReportAccess || segments.length === 0) return null;
  const segmentTitle = activeSegment ? SEGMENT_LABELS[activeSegment] : SEGMENT_LABELS[segments[0]];
  const hasAdvisory = tree.assigned.advisorySections.length > 0;
  const hasHandled = tree.assigned.handledSections.length > 0;
  const showInnerTabs = activeSegment === "assigned" && hasAdvisory && hasHandled;

  return (
    <section className={styles.section}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h2 className={styles.sectionTitle}>{segmentTitle}</h2>
          <Link href="/reports" className={styles.externalLink} aria-label="Open reports module">
            <IconExternalLink size={14} stroke={2} />
          </Link>
        </div>

        <div className={styles.headerRight}>
          {/* Desktop only: segmented control stays in header */}
          {segments.length > 1 && !isMobile && (
            <SegmentedControl
              size="xs"
              color="#4EAE4A"
              radius="sm"
              value={activeSegment ?? segments[0]}
              onChange={(v) => setActiveSegment(v as ReportSegment)}
              data={segments.map((s) => ({ value: s, label: SEGMENT_LABELS[s] }))}
              styles={reportSegmentedStyles}
            />
          )}
          <button
            className={styles.collapseBtn}
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand section" : "Collapse section"}
          >
            {collapsed ? <IconChevronDown size={14} stroke={2.2} /> : <IconChevronUp size={14} stroke={2.2} />}
          </button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <Collapse in={!collapsed} transitionDuration={200} animateOpacity>
        <Box p="sm">
          {/* Mobile only: "Mode" dropdown inside body */}
          {segments.length > 1 && isMobile && (
            <Group align="center" gap="xs" mb="sm">
              <Text size="sm" fw={600} c="dimmed">Mode</Text>
              <Select
                size="xs"
                value={activeSegment ?? segments[0]}
                onChange={(v) => v && setActiveSegment(v as ReportSegment)}
                data={segments.map((s) => ({ value: s, label: SEGMENT_LABELS[s] }))}
                style={{ flex: 1 }}
                comboboxProps={{ withinPortal: true }}
                styles={{ input: { fontSize: 14, height: 32, minHeight: 32 }, option: { fontSize: 14 } }}
              />
            </Group>
          )}
          {/* Advisory / Subjects inner tab */}
          {showInnerTabs && (
            <SegmentedControl
              size="sm"
              value={assignedView}
              onChange={(v) => setAssignedView(v as AssignedView)}
              data={[
                { value: "advisory", label: "Advisory" },
                { value: "subjects", label: "Subjects" },
              ]}
              color="#4EAE4A"
              radius="sm"
              transitionDuration={180}
              styles={{
                root: {
                  backgroundColor: "#ffffff",
                  border: "1px solid #D6D9E0",
                  padding: 3,
                  width: "min(100%, 300px)",
                  minWidth: 0,
                  marginBottom: 10,
                },
                label: {
                  fontWeight: 500,
                  fontSize: "clamp(12px, 2.7vw, 14px)",
                  padding: "3px 6px",
                  whiteSpace: "nowrap" as const,
                },
                indicator: { border: "1px solid #4EAE4A" },
              }}
            />
          )}

          {/* Content */}
          {loading ? (
            <LoadingSkeleton />
          ) : activeSegment === "assigned" ? (
            assignedView === "advisory" || !hasHandled ? (
              <AdvisoryContent sections={tree.assigned.advisorySections} />
            ) : (
              <HandledSubjectsContent sections={tree.assigned.handledSections} />
            )
          ) : activeSegment === "grade" ? (
            <GradeContent grades={tree.gradeMonitoring} />
          ) : activeSegment === "subject-group" ? (
            <SubjectGroupContent groups={tree.subjectGroupMonitoring} />
          ) : (
            <AllMonitoringContent tree={tree} />
          )}
        </Box>
      </Collapse>
    </section>
  );
}
