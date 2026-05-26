"use client";

import type { MouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Accordion,
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconChevronRight,
  IconRefresh,
} from "@tabler/icons-react";
import EmptySearchState from "@/components/EmptySearchState";
import { useAuth } from "@/context/AuthContext";
import { useReportPermissions } from "@/hooks/useReportPermissions";
import {
  fetchReportMonitoringTree,
  invalidateReportsCache,
  type ReportMonitoringCoordinatorGroup,
  type ReportMonitoringGradeGroup,
  type ReportMonitoringRow,
  type ReportMonitoringSectionGroup,
  type ReportMonitoringSubjectGroup,
  type ReportMonitoringTree,
} from "@/lib/services/reportsAnalysisService";

const emptyTree: ReportMonitoringTree = {
  assigned: { advisorySections: [], handledSections: [] },
  gradeMonitoring: [],
  subjectGroupMonitoring: [],
  allMonitoring: { gradeLevels: [], subjectGroups: [] },
};

const reportAccordionStyles = {
  control: { backgroundColor: "#F5F5F5" },
  item: { border: "1px solid #e2edff" },
};

const subAccordionStyles = {
  item: {
    border: "1px solid #D6D9E0",
    borderRadius: 6,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  control: {
    backgroundColor: "#ffffff",
    padding: "12px 14px",
    borderBottom: "1px solid #e5e7eb",
    "&:hover": { backgroundColor: "#ffffff" },
  },
  label: { padding: 0 },
  content: { padding: "0 12px 8px" },
  panel: { padding: 0 },
};

const reportSegmentedStyles = {
  root: {
    backgroundColor: "#ffffff",
    border: "1px solid #D6D9E0",
    padding: 3,
    width: "min(100%, 300px)",
    minWidth: 0,
  },
  label: {
    fontWeight: 500,
    fontSize: "clamp(12px, 2.7vw, 14px)",
    padding: "3px 6px",
    whiteSpace: "nowrap",
  },
  indicator: {
    border: "1px solid #4EAE4A",
  },
};

function StatusBadge({ status }: { status: ReportMonitoringRow["status"] }) {
  const color =
    status === "Finalized" ? "green" : status === "Not Finalized" ? "red" : "gray";
  return (
    <Badge color={color} variant="light" miw={112} ta="center">
      {status}
    </Badge>
  );
}

function ProgressSummary({ rows }: { rows: ReportMonitoringRow[] }) {
  const finalized = rows.filter((row) => row.status === "Finalized").length;
  return (
    <Text span size="sm" c="dimmed" fw={500}>
      ({finalized}/{rows.length})
    </Text>
  );
}

function RowLine({
  row,
  label,
  isLast = false,
}: {
  row: ReportMonitoringRow;
  label: string;
  isLast?: boolean;
}) {
  const router = useRouter();
  const href =
    row.latestExamId != null
      ? `/reports/subject/${row.gradeLevelId}/${row.subjectId}/${row.latestExamId}`
      : null;

  return (
    <Group
      justify="space-between"
      gap="sm"
      py="xs"
      pl={24}
      pr={12}
      wrap="nowrap"
      className={`relative before:absolute before:left-[-13px] before:top-0 before:w-[2px] before:bg-[#8b919c] before:content-[''] after:absolute after:left-[-13px] after:top-1/2 after:h-[2px] after:w-[18px] after:-translate-y-1/2 after:bg-[#8b919c] after:content-[''] [&_.tree-node]:absolute [&_.tree-node]:left-[1px] [&_.tree-node]:top-1/2 [&_.tree-node]:h-[8px] [&_.tree-node]:w-[8px] [&_.tree-node]:-translate-y-1/2 [&_.tree-node]:bg-[#9ca3af] ${
        isLast ? "before:bottom-1/2" : "before:bottom-0"
      }`}
      style={{
        borderBottom: "1px solid #e5e7eb",
        marginRight: -12,
      }}
    >
      <span className="tree-node" aria-hidden="true" />
      <Group gap="xs" style={{ minWidth: 0, flex: 1 }} wrap="nowrap">
        <Text size="sm" lineClamp={1}>
          {label}
        </Text>
      </Group>
      <StatusBadge status={row.status} />
      <Group gap={6} wrap="nowrap" w={{ base: 150, sm: 230 }} style={{ minWidth: 0 }}>
        <Text size="sm" lineClamp={1} c={row.teacherName ? undefined : "dimmed"}>
          {row.teacherName ?? "Unassigned"}
        </Text>
      </Group>
      <Button
        variant="subtle"
        color="#4EAE4A"
        size="compact-sm"
        px={6}
        disabled={!href}
        onClick={() => href && router.push(href)}
        rightSection={<IconChevronRight size={14} />}
      >
        View
      </Button>
    </Group>
  );
}

function TreeGuide({ children }: { children: ReactNode }) {
  return (
    <Box
      ml="sm"
      pl="sm"
      style={{
        marginRight: -12,
        paddingRight: 12,
      }}
    >
      {children}
    </Box>
  );
}

function TreeBranchLine({
  label,
  rows,
}: {
  label: string;
  rows: ReportMonitoringRow[];
}) {
  return (
    <Box
      style={{
        borderBottom: "1px solid #e5e7eb",
        marginRight: -12,
        paddingRight: 12,
      }}
    >
      <Group gap="xs" py={6} wrap="nowrap">
        <Text fw={500} size="md" lineClamp={1}>
          {label}
        </Text>
        <ProgressSummary rows={rows} />
      </Group>
      <Box ml="lg" pl="sm">
        {rows.length === 0 ? (
          <EmptyPanel message="No active sections found for this grade subject." />
        ) : (
          rows.map((row, index) => (
            <RowLine
              key={`${row.sectionId}-${row.curriculumSubjectId}`}
              row={row}
              label={row.sectionName}
              isLast={index === rows.length - 1}
            />
          ))
        )}
      </Box>
    </Box>
  );
}

function SubjectTreeList({
  subjects,
  emptyMessage,
}: {
  subjects: ReportMonitoringSubjectGroup[];
  emptyMessage: string;
}) {
  if (subjects.length === 0) return <EmptyPanel message={emptyMessage} />;

  return (
    <TreeGuide>
      {subjects.map((subject) => (
        <TreeBranchLine
          key={subject.curriculumSubjectId}
          label={subject.subjectName}
          rows={subject.rows}
        />
      ))}
    </TreeGuide>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <Box py="md">
      <Text size="sm" c="dimmed" ta="center">
        {message}
      </Text>
    </Box>
  );
}

function keepClosedAccordionInView(event: MouseEvent<HTMLElement>) {
  const item = event.currentTarget.closest(".mantine-Accordion-item");
  const control = item?.querySelector(".mantine-Accordion-control");
  window.setTimeout(() => {
    (control ?? item)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, 220);
}

function SectionAccordion({
  sections,
  rowLabel,
  emptyMessage,
}: {
  sections: ReportMonitoringSectionGroup[];
  rowLabel: (row: ReportMonitoringRow) => string;
  emptyMessage: string;
}) {
  const [openSections, setOpenSections] = useState<string[]>([]);

  if (sections.length === 0) return <EmptyPanel message={emptyMessage} />;

  return (
    <Accordion
      multiple
      value={openSections}
      onChange={setOpenSections}
      variant="separated"
      styles={subAccordionStyles}
    >
      {sections.map((section) => (
        <Accordion.Item
          key={section.sectionId}
          value={`section-${section.sectionId}`}
        >
          <Accordion.Control>
            <Group gap="xs">
              <Text fw={700} size="md">
                {section.gradeDisplayName}
                {" \u2022 "}
                {section.sectionName}
              </Text>
              <ProgressSummary rows={section.rows} />
            </Group>
          </Accordion.Control>
          <Accordion.Panel
            onDoubleClick={(event) => {
              setOpenSections((current) =>
                current.filter((value) => value !== `section-${section.sectionId}`),
              );
              keepClosedAccordionInView(event);
            }}
          >
            <TreeGuide>
              {section.rows.map((row, index) => (
                <RowLine
                  key={`${row.sectionId}-${row.curriculumSubjectId}`}
                  row={row}
                  label={rowLabel(row)}
                  isLast={index === section.rows.length - 1}
                />
              ))}
            </TreeGuide>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

function GradeMonitoring({
  grades,
  emptyMessage,
}: {
  grades: ReportMonitoringGradeGroup[];
  emptyMessage: string;
}) {
  const [openGrades, setOpenGrades] = useState<string[]>([]);

  if (grades.length === 0) return <EmptyPanel message={emptyMessage} />;

  return (
    <Accordion
      multiple
      value={openGrades}
      onChange={setOpenGrades}
      variant="separated"
      styles={subAccordionStyles}
    >
      {grades.map((grade) => (
        <Accordion.Item key={grade.gradeLevelId} value={`grade-${grade.gradeLevelId}`}>
          <Accordion.Control>
            <Group gap="xs">
              <Text fw={700} size="md">
                {grade.gradeDisplayName}
              </Text>
              <Text span size="sm" c="dimmed">
                ({grade.subjects.length})
              </Text>
            </Group>
          </Accordion.Control>
          <Accordion.Panel
            onDoubleClick={(event) => {
              setOpenGrades((current) =>
                current.filter((value) => value !== `grade-${grade.gradeLevelId}`),
              );
              keepClosedAccordionInView(event);
            }}
          >
            <SubjectTreeList
              subjects={grade.subjects}
              emptyMessage="No subjects are available for this grade level."
            />
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

function SubjectGroupMonitoring({
  groups,
  emptyMessage,
}: {
  groups: ReportMonitoringCoordinatorGroup[];
  emptyMessage: string;
}) {
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  if (groups.length === 0) return <EmptyPanel message={emptyMessage} />;

  return (
    <Accordion
      multiple
      value={openGroups}
      onChange={setOpenGroups}
      variant="separated"
      styles={subAccordionStyles}
    >
      {groups.map((group) => (
        <Accordion.Item
          key={group.subjectGroupId}
          value={`subject-group-${group.subjectGroupId}`}
        >
          <Accordion.Control>
            <Group gap="xs">
              <Text fw={700} size="md">
                {group.subjectGroupName}
              </Text>
              <Text span size="sm" c="dimmed">
                ({group.subjects.length})
              </Text>
            </Group>
          </Accordion.Control>
          <Accordion.Panel
            onDoubleClick={(event) => {
              setOpenGroups((current) =>
                current.filter((value) => value !== `subject-group-${group.subjectGroupId}`),
              );
              keepClosedAccordionInView(event);
            }}
          >
            <SubjectTreeList
              subjects={group.subjects}
              emptyMessage="No subject rows are available for this group."
            />
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

function AssignedReports({ tree }: { tree: ReportMonitoringTree }) {
  const [view, setView] = useState<"advisory" | "assigned">("advisory");
  const hasAdvisory = tree.assigned.advisorySections.length > 0;
  const hasHandled = tree.assigned.handledSections.length > 0;

  useEffect(() => {
    if (!hasAdvisory && hasHandled) setView("assigned");
    if (hasAdvisory && !hasHandled) setView("advisory");
  }, [hasAdvisory, hasHandled]);

  if (!hasAdvisory && !hasHandled) {
    return <EmptyPanel message="No advisory or assigned subject reports found." />;
  }

  const showSegmented = hasAdvisory && hasHandled;

  return (
    <Stack gap="sm">
      {showSegmented && (
        <SegmentedControl
          value={view}
          onChange={(value) => setView(value as "advisory" | "assigned")}
          data={[
            { value: "advisory", label: "Advisory" },
            { value: "assigned", label: "Assigned Subjects" },
          ]}
          color="#4EAE4A"
          radius="sm"
          size="sm"
          transitionDuration={180}
          styles={reportSegmentedStyles}
        />
      )}

      {(view === "advisory" || !showSegmented) && hasAdvisory ? (
        <SectionAccordion
          sections={tree.assigned.advisorySections}
          rowLabel={(row) => row.subjectName}
          emptyMessage="No advisory reports found."
        />
      ) : (
        <SectionAccordion
          sections={tree.assigned.handledSections}
          rowLabel={(row) => row.subjectName}
          emptyMessage="No assigned subject reports found."
        />
      )}
    </Stack>
  );
}

function ReportsMonitoring({ tree }: { tree: ReportMonitoringTree }) {
  const [view, setView] = useState<"grade" | "subject-group">("grade");

  return (
    <Stack gap="sm">
      <SegmentedControl
        value={view}
        onChange={(value) => setView(value as "grade" | "subject-group")}
        data={[
          { value: "grade", label: "Grade Level" },
          { value: "subject-group", label: "Subject Group" },
        ]}
        color="#4EAE4A"
        radius="sm"
        size="sm"
        transitionDuration={180}
        styles={reportSegmentedStyles}
      />
      {view === "grade" ? (
        <GradeMonitoring
          grades={tree.allMonitoring.gradeLevels}
          emptyMessage="No grade level reports found."
        />
      ) : (
        <SubjectGroupMonitoring
          groups={tree.allMonitoring.subjectGroups}
          emptyMessage="No subject group reports found."
        />
      )}
    </Stack>
  );
}

function LoadingState() {
  return (
    <Stack gap="md">
      {[1, 2, 3].map((item) => (
        <Box
          key={item}
          style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}
        >
          <Box px="md" py="sm" style={{ backgroundColor: "#f3f4f6" }}>
            <Skeleton height={18} width={220} radius="sm" />
          </Box>
          <Box p="sm">
            <Skeleton height={44} radius="sm" mb="xs" />
            <Skeleton height={44} radius="sm" />
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

export default function ReportsBrowser() {
  const { user } = useAuth();
  const reportScope = useReportPermissions();
  const [loading, setLoading] = useState(true);
  const [tree, setTree] = useState<ReportMonitoringTree>(emptyTree);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = async (forceRefresh = false) => {
    setLoading(true);
    setLoadError(null);
    try {
      if (forceRefresh) invalidateReportsCache();
      setTree(
        await fetchReportMonitoringTree(user?.id ?? null, {
          canViewAll: reportScope.canViewAll,
          canViewAssigned: reportScope.canViewAssigned,
          canMonitorGradeLevel: reportScope.canMonitorGradeLevel,
          canMonitorSubjects: reportScope.canMonitorSubjects,
        }),
      );
    } catch (error) {
      setTree(emptyTree);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Failed to load reports. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user?.id,
    reportScope.canViewAll,
    reportScope.canViewAssigned,
    reportScope.canMonitorGradeLevel,
    reportScope.canMonitorSubjects,
  ]);

  const hasAnyVisibleSection = useMemo(
    () =>
      reportScope.canViewAll ||
      reportScope.canViewAssigned ||
      reportScope.canMonitorGradeLevel ||
      reportScope.canMonitorSubjects,
    [reportScope],
  );

  if (loading || reportScope.scopeLoading) return <LoadingState />;

  if (!hasAnyVisibleSection) return <EmptySearchState />;

  return (
    <div className="space-y-5">
      <Group justify="space-between" align="flex-end" gap="sm">
        <div>
          <h1 className="text-3xl font-bold text-[#597D37]">Reports</h1>
          <p className="mb-3 text-sm text-[#808898]">Monitor finalized assessment reports</p>
        </div>
        <Tooltip label="Refresh" position="bottom" withArrow>
          <ActionIcon
            variant="outline"
            color="#808898"
            size="lg"
            radius="xl"
            onClick={() => void loadData(true)}
            loading={loading}
            aria-label="Refresh reports"
          >
            <IconRefresh size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {loadError && (
        <Box
          p="sm"
          style={{
            border: "1px solid #fde68a",
            backgroundColor: "#fffbeb",
            borderRadius: 6,
          }}
        >
          <Text size="sm" c="yellow.9">
            {loadError}
          </Text>
        </Box>
      )}

      <Accordion
        multiple
        defaultValue={[
          reportScope.canViewAll ? "reports-monitoring" : "",
          reportScope.canViewAssigned ? "assigned" : "",
          reportScope.canMonitorGradeLevel ? "grade-subject-monitoring" : "",
          reportScope.canMonitorSubjects ? "subject-group-monitoring" : "",
        ].filter(Boolean)}
        variant="separated"
        styles={reportAccordionStyles}
      >
        {reportScope.canViewAll && (
          <Accordion.Item value="reports-monitoring">
            <Accordion.Control>
              <Text fw={700} size="md" c="#1f2937">
                Reports Monitoring
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <ReportsMonitoring tree={tree} />
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {reportScope.canViewAssigned && (
          <Accordion.Item value="assigned">
            <Accordion.Control>
              <Text fw={700} size="md" c="#1f2937">
                Assigned
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <AssignedReports tree={tree} />
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {reportScope.canMonitorGradeLevel && (
          <Accordion.Item value="grade-subject-monitoring">
            <Accordion.Control>
              <Text fw={700} size="md" c="#1f2937">
                Grade Subject Monitoring
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <GradeMonitoring
                grades={tree.gradeMonitoring}
                emptyMessage="No active grade subject leader assignment found for this school year."
              />
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {reportScope.canMonitorSubjects && (
          <Accordion.Item value="subject-group-monitoring">
            <Accordion.Control>
              <Text fw={700} size="md" c="#1f2937">
                Subject Group Monitoring
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <SubjectGroupMonitoring
                groups={tree.subjectGroupMonitoring}
                emptyMessage="No active subject group assignment found for this school year."
              />
            </Accordion.Panel>
          </Accordion.Item>
        )}
      </Accordion>
    </div>
  );
}
