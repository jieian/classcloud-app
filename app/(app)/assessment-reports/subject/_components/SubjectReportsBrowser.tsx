"use client";

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
}: {
  row: ReportMonitoringRow;
  label: string;
}) {
  const router = useRouter();
  const href =
    row.latestExamId != null
      ? `/assessment-reports/report-analytics/subject/${row.gradeLevelId}/${row.subjectId}/${row.latestExamId}`
      : null;

  return (
    <Group
      justify="space-between"
      gap="sm"
      py="xs"
      px="sm"
      wrap="nowrap"
      style={{ borderBottom: "1px dotted #d1d5db" }}
    >
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

function EmptyPanel({ message }: { message: string }) {
  return (
    <Box py="md">
      <Text size="sm" c="dimmed" ta="center">
        {message}
      </Text>
    </Box>
  );
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
  if (sections.length === 0) return <EmptyPanel message={emptyMessage} />;

  return (
    <Accordion multiple variant="separated" styles={reportAccordionStyles}>
      {sections.map((section) => (
        <Accordion.Item key={section.sectionId} value={`section-${section.sectionId}`}>
          <Accordion.Control>
            <Group gap="xs">
              <Text fw={700} size="sm">
                {section.gradeDisplayName} • {section.sectionName}
              </Text>
              <ProgressSummary rows={section.rows} />
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            {section.rows.map((row) => (
              <RowLine
                key={`${row.sectionId}-${row.curriculumSubjectId}`}
                row={row}
                label={rowLabel(row)}
              />
            ))}
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

function SubjectAccordion({
  subjects,
  emptyMessage,
}: {
  subjects: ReportMonitoringSubjectGroup[];
  emptyMessage: string;
}) {
  if (subjects.length === 0) return <EmptyPanel message={emptyMessage} />;

  return (
    <Accordion multiple variant="separated" styles={reportAccordionStyles}>
      {subjects.map((subject) => (
        <Accordion.Item
          key={subject.curriculumSubjectId}
          value={`subject-${subject.curriculumSubjectId}`}
        >
          <Accordion.Control>
            <Group gap="xs">
              <Text fw={700} size="sm">
                {subject.subjectName}
              </Text>
              <ProgressSummary rows={subject.rows} />
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            {subject.rows.map((row) => (
              <RowLine
                key={`${row.sectionId}-${row.curriculumSubjectId}`}
                row={row}
                label={row.sectionName}
              />
            ))}
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
  if (grades.length === 0) return <EmptyPanel message={emptyMessage} />;

  return (
    <Accordion multiple variant="separated" styles={reportAccordionStyles}>
      {grades.map((grade) => (
        <Accordion.Item key={grade.gradeLevelId} value={`grade-${grade.gradeLevelId}`}>
          <Accordion.Control>
            <Group gap="xs">
              <Text fw={700} size="sm">
                {grade.gradeDisplayName}
              </Text>
              <Text span size="sm" c="dimmed">
                ({grade.subjects.length})
              </Text>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <SubjectAccordion
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
  if (groups.length === 0) return <EmptyPanel message={emptyMessage} />;

  return (
    <Accordion multiple variant="separated" styles={reportAccordionStyles}>
      {groups.map((group) => (
        <Accordion.Item
          key={group.subjectGroupId}
          value={`subject-group-${group.subjectGroupId}`}
        >
          <Accordion.Control>
            <Group gap="xs">
              <Text fw={700} size="sm">
                {group.subjectGroupName}
              </Text>
              <Text span size="sm" c="dimmed">
                ({group.subjects.length})
              </Text>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <SubjectAccordion
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

export default function SubjectReportsBrowser() {
  const { user } = useAuth();
  const reportScope = useReportPermissions();
  const [loading, setLoading] = useState(true);
  const [tree, setTree] = useState<ReportMonitoringTree>(emptyTree);

  const loadData = async () => {
    setLoading(true);
    try {
      setTree(await fetchReportMonitoringTree(user?.id ?? null));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
            onClick={() => void loadData()}
            loading={loading}
            aria-label="Refresh reports"
          >
            <IconRefresh size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Group>

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

        {reportScope.canMonitorGradeLevel && !reportScope.canViewAll && (
          <Accordion.Item value="grade-subject-monitoring">
            <Accordion.Control>
              <Text fw={700} size="md" c="#1f2937">
                Grade Subject Monitoring
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <GradeMonitoring
                grades={tree.gradeMonitoring}
                emptyMessage="No grade subject monitoring reports found."
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
