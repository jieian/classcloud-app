"use client";

import type { MouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Accordion,
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Popover,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconChevronRight,
  IconRefresh,
  IconUserSquareRounded,
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

const STATUS_COLORS = {
  done: "#4EAE4A",
  ongoing: "#fdba74",
  notStarted: "#d1d5db",
};

function StatusBadge({ status }: { status: ReportMonitoringRow["status"] }) {
  const color =
    status === "Finalized" ? "green" : status === "Not Finalized" ? "orange" : "gray";
  const label =
    status === "Finalized"
      ? "Done"
      : status === "Not Finalized"
        ? "Ongoing"
        : "Not Started";
  return (
    <Badge color={color} variant="light" w={108} ta="center" style={{ overflow: "visible" }}>
      {label}
    </Badge>
  );
}


type StatusCounts = {
  done: number;
  ongoing: number;
  notStarted: number;
};

function statusCountsTotal(counts: StatusCounts) {
  return counts.done + counts.ongoing + counts.notStarted;
}

function getRowStatusCounts(rows: ReportMonitoringRow[]): StatusCounts {
  const done = rows.filter((row) => row.status === "Finalized").length;
  const ongoing = rows.filter((row) => row.status === "Not Finalized").length;
  return {
    done,
    ongoing,
    notStarted: Math.max(rows.length - done - ongoing, 0),
  };
}

function getSubjectSubgroupStatusCounts(subjects: ReportMonitoringSubjectGroup[]): StatusCounts {
  return subjects.reduce<StatusCounts>(
    (counts, subject) => {
      if (subject.rows.length === 0) {
        counts.notStarted += 1;
        return counts;
      }

      if (subject.rows.every((row) => row.status === "Finalized")) {
        counts.done += 1;
      } else if (subject.rows.every((row) => row.status === "No exam yet")) {
        counts.notStarted += 1;
      } else {
        counts.ongoing += 1;
      }

      return counts;
    },
    { done: 0, ongoing: 0, notStarted: 0 },
  );
}


function classifySubgroupFromRows(rows: ReportMonitoringRow[]): keyof StatusCounts {
  if (rows.length === 0) return "notStarted";
  if (rows.every((row) => row.status === "Finalized")) return "done";
  if (rows.every((row) => row.status === "No exam yet")) return "notStarted";
  return "ongoing";
}

function classifySubgroupFromCounts(counts: StatusCounts): keyof StatusCounts {
  const total = statusCountsTotal(counts);
  if (total === 0) return "notStarted";
  if (counts.done === total) return "done";
  if (counts.notStarted === total) return "notStarted";
  return "ongoing";
}

function getSectionGroupStatusCounts(sections: ReportMonitoringSectionGroup[]): StatusCounts {
  return sections.reduce<StatusCounts>(
    (counts, section) => {
      counts[classifySubgroupFromRows(section.rows)] += 1;
      return counts;
    },
    { done: 0, ongoing: 0, notStarted: 0 },
  );
}

function getGradeGroupStatusCounts(grades: ReportMonitoringGradeGroup[]): StatusCounts {
  return grades.reduce<StatusCounts>(
    (counts, grade) => {
      counts[classifySubgroupFromCounts(getSubjectSubgroupStatusCounts(grade.subjects))] += 1;
      return counts;
    },
    { done: 0, ongoing: 0, notStarted: 0 },
  );
}

function getCoordinatorGroupStatusCounts(groups: ReportMonitoringCoordinatorGroup[]): StatusCounts {
  return groups.reduce<StatusCounts>(
    (counts, group) => {
      counts[classifySubgroupFromCounts(getSubjectSubgroupStatusCounts(group.subjects))] += 1;
      return counts;
    },
    { done: 0, ongoing: 0, notStarted: 0 },
  );
}


function StatusCircle({ counts, label }: { counts: StatusCounts; label: string }) {
  const [opened, setOpened] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const total = statusCountsTotal(counts);
  const doneDeg = total === 0 ? 0 : (counts.done / total) * 360;
  const ongoingDeg = total === 0 ? 0 : (counts.ongoing / total) * 360;
  const doneEnd = doneDeg;
  const ongoingEnd = doneDeg + ongoingDeg;
  const ringBackground =
    total === 0
      ? "#e5e7eb"
      : `conic-gradient(${STATUS_COLORS.done} 0deg ${doneEnd}deg, ${STATUS_COLORS.ongoing} ${doneEnd}deg ${ongoingEnd}deg, ${STATUS_COLORS.notStarted} ${ongoingEnd}deg 360deg)`;

  const isTouchDevice =
    typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;

  function handleMouseEnter() {
    if (isTouchDevice) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpened(true);
  }

  function handleMouseLeave() {
    if (isTouchDevice) return;
    closeTimer.current = setTimeout(() => setOpened(false), 80);
  }

  function handleClick(event: MouseEvent) {
    event.stopPropagation();
    if (isTouchDevice) setOpened((current) => !current);
  }

  const statusItems = [
    { label: "Done", count: counts.done, color: STATUS_COLORS.done },
    { label: "Ongoing", count: counts.ongoing, color: STATUS_COLORS.ongoing },
    { label: "Not Started", count: counts.notStarted, color: STATUS_COLORS.notStarted },
  ];

  return (
    <Popover
      opened={opened}
      onClose={() => setOpened(false)}
      width={220}
      shadow="sm"
      withinPortal
      position="right"
      closeOnClickOutside={isTouchDevice}
    >
      <Popover.Target>
        <Box
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            flex: "0 0 auto",
            background: ringBackground,
            cursor: isTouchDevice ? "pointer" : "default",
          }}
        >
          <Box
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              backgroundColor: "#ffffff",
            }}
          >
            <Text size="11px" fw={700} c="#4b5563">
              {counts.done}/{total}
            </Text>
          </Box>
        </Box>
      </Popover.Target>

      <Popover.Dropdown
        style={{ border: "1px solid #d3e9d0", borderRadius: 10, padding: "12px 14px" }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(event) => event.stopPropagation()}
      >
        <Text size="10px" fw={700} tt="uppercase" c="#4EAE4A" style={{ letterSpacing: "0.06em" }}>
          {label}
        </Text>
        <Divider my={8} color="#e8f0e8" />
        <Box style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {statusItems.map((item) => (
            <Group key={item.label} gap={8} wrap="nowrap" align="center">
              <Box
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  backgroundColor: item.color,
                  flexShrink: 0,
                }}
              />
              <Text size="sm" c="dimmed" style={{ lineHeight: 1.4, flex: 1 }}>
                {item.label}
              </Text>
              <Text size="sm" fw={700} c="#4b5563">
                {item.count}
              </Text>
            </Group>
          ))}
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
}

function MainAccordionHeader({
  title,
  counts,
}: {
  title: string;
  counts: StatusCounts;
}) {
  return (
    <Group gap="sm" wrap="nowrap">
      <StatusCircle counts={counts} label={title} />
      <Text fw={700} size="md" c="#1f2937">
        {title}
      </Text>
    </Group>
  );
}

function StatusStackedBar({ counts, label }: { counts: StatusCounts; label: string }) {
  const [opened, setOpened] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const total = statusCountsTotal(counts);
  const { done, ongoing, notStarted } = counts;
  const statusItems = [
    { label: "Done", count: done, color: STATUS_COLORS.done },
    { label: "Ongoing", count: ongoing, color: STATUS_COLORS.ongoing },
    { label: "Not Started", count: notStarted, color: STATUS_COLORS.notStarted },
  ];

  const isTouchDevice =
    typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;

  function handleMouseEnter() {
    if (isTouchDevice) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpened(true);
  }

  function handleMouseLeave() {
    if (isTouchDevice) return;
    closeTimer.current = setTimeout(() => setOpened(false), 80);
  }

  function handleClick(event: MouseEvent) {
    event.stopPropagation();
    if (isTouchDevice) setOpened((current) => !current);
  }

  if (total === 0) {
    return (
      <Box
        h={16}
        style={{
          flex: 1,
          minWidth: 88,
          maxWidth: 210,
          border: "1px solid #D6D9E0",
          borderRadius: 3,
          backgroundColor: "#f3f4f6",
        }}
      />
    );
  }

  const segments = [
    { key: "done", count: done, color: STATUS_COLORS.done, label: "Done" },
    { key: "ongoing", count: ongoing, color: STATUS_COLORS.ongoing, label: "Ongoing" },
    { key: "not-started", count: notStarted, color: STATUS_COLORS.notStarted, label: "Not Started" },
  ].filter((segment) => segment.count > 0);

  return (
    <Popover
      opened={opened}
      onClose={() => setOpened(false)}
      width={220}
      shadow="sm"
      withinPortal
      position="right"
      closeOnClickOutside={isTouchDevice}
    >
      <Popover.Target>
        <Box
          h={16}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          style={{
            display: "flex",
            flex: 1,
            minWidth: 88,
            maxWidth: 210,
            overflow: "hidden",
            border: "1px solid #D6D9E0",
            borderRadius: 3,
            backgroundColor: "#ffffff",
            cursor: isTouchDevice ? "pointer" : "default",
          }}
        >
          {segments.map((segment) => (
            <Box
              key={segment.key}
              aria-label={`${segment.label}: ${segment.count}`}
              style={{
                width: `${(segment.count / total) * 100}%`,
                backgroundColor: segment.color,
              }}
            />
          ))}
        </Box>
      </Popover.Target>

      <Popover.Dropdown
        style={{
          border: "1px solid #d3e9d0",
          borderRadius: 10,
          padding: "12px 14px",
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(event) => event.stopPropagation()}
      >
        <Text
          size="10px"
          fw={700}
          tt="uppercase"
          c="#4EAE4A"
          style={{ letterSpacing: "0.06em" }}
        >
          {label}
        </Text>
        <Divider my={8} color="#e8f0e8" />
        <Box style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {statusItems.map((item) => (
            <Group key={item.label} gap={8} wrap="nowrap" align="center">
              <Box
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  backgroundColor: item.color,
                  flexShrink: 0,
                }}
              />
              <Text size="sm" c="dimmed" style={{ lineHeight: 1.4, flex: 1 }}>
                {item.label}
              </Text>
              <Text size="sm" fw={700} c="#4b5563">
                {item.count}
              </Text>
            </Group>
          ))}
        </Box>
      </Popover.Dropdown>
    </Popover>
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
      className={`relative before:absolute before:left-[-13px] before:top-0 before:w-[2px] before:bg-[#d1d5db] before:content-[''] after:absolute after:left-[-13px] after:top-1/2 after:h-[2px] after:w-[18px] after:-translate-y-1/2 after:bg-[#d1d5db] after:content-[''] [&_.tree-node]:absolute [&_.tree-node]:left-[1px] [&_.tree-node]:top-1/2 [&_.tree-node]:h-[8px] [&_.tree-node]:w-[8px] [&_.tree-node]:-translate-y-1/2 [&_.tree-node]:bg-[#d1d5db] ${
        isLast ? "before:bottom-1/2" : "before:bottom-0"
      }`}
      style={{
        borderBottom: "1px solid #e5e7eb",
        marginRight: -12,
      }}
    >
      <span className="tree-node" aria-hidden="true" />
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: "90px 108px max-content",
          alignItems: "center",
          columnGap: 10,
          minWidth: 0,
          flex: "0 1 auto",
        }}
      >
        <Tooltip label={label} position="top-start" withArrow disabled={label.length < 22}>
          <Text size="sm" truncate="end" style={{ minWidth: 0 }}>
            {label}
          </Text>
        </Tooltip>
        <StatusBadge status={row.status} />
        <Group gap={4} wrap="nowrap" ml={4}>
          <IconUserSquareRounded size={15} stroke={1.7} color="#6b7280" />
          <Text size="sm" c={row.teacherName ? undefined : "dimmed"} style={{ whiteSpace: "nowrap" }}>
            {row.teacherName ?? "Unassigned"}
          </Text>
        </Group>
      </Box>
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
        <Tooltip label={label} position="top-start" withArrow disabled={label.length < 22}>
          <Text fw={500} size="md" truncate="end" maw={220}>
            {label}
          </Text>
        </Tooltip>
        <StatusStackedBar counts={getRowStatusCounts(rows)} label={label} />
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
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              <StatusCircle counts={getRowStatusCounts(section.rows)} label={`${section.gradeDisplayName} • ${section.sectionName}`} />
              <Tooltip
                label={`${section.gradeDisplayName} \u2022 ${section.sectionName}`}
                position="top-start"
                withArrow
                disabled={`${section.gradeDisplayName} ${section.sectionName}`.length < 24}
              >
                <Text fw={700} size="md" truncate="end" maw={260}>
                  {section.gradeDisplayName}
                  {" \u2022 "}
                  {section.sectionName}
                </Text>
              </Tooltip>
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
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              <StatusCircle counts={getSubjectSubgroupStatusCounts(grade.subjects)} label={grade.gradeDisplayName} />
              <Tooltip
                label={grade.gradeDisplayName}
                position="top-start"
                withArrow
                disabled={grade.gradeDisplayName.length < 24}
              >
                <Text fw={700} size="md" truncate="end" maw={260}>
                  {grade.gradeDisplayName}
                </Text>
              </Tooltip>
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
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              <StatusCircle counts={getSubjectSubgroupStatusCounts(group.subjects)} label={group.subjectGroupName} />
              <Tooltip
                label={group.subjectGroupName}
                position="top-start"
                withArrow
                disabled={group.subjectGroupName.length < 24}
              >
                <Text fw={700} size="md" truncate="end" maw={260}>
                  {group.subjectGroupName}
                </Text>
              </Tooltip>
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

function AssignedReports({
  tree,
  view,
  onViewChange,
}: {
  tree: ReportMonitoringTree;
  view: "advisory" | "assigned";
  onViewChange: (v: "advisory" | "assigned") => void;
}) {
  const hasAdvisory = tree.assigned.advisorySections.length > 0;
  const hasHandled = tree.assigned.handledSections.length > 0;

  useEffect(() => {
    if (!hasAdvisory && hasHandled) onViewChange("assigned");
    if (hasAdvisory && !hasHandled) onViewChange("advisory");
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
          onChange={(value) => onViewChange(value as "advisory" | "assigned")}
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

function ReportsMonitoring({
  tree,
  view,
  onViewChange,
}: {
  tree: ReportMonitoringTree;
  view: "grade" | "subject-group";
  onViewChange: (view: "grade" | "subject-group") => void;
}) {
  return (
    <Stack gap="sm">
      <SegmentedControl
        value={view}
        onChange={(value) => onViewChange(value as "grade" | "subject-group")}
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

function ReportsMonitoringAccordionHeader({
  tree,
  view,
}: {
  tree: ReportMonitoringTree;
  view: "grade" | "subject-group";
}) {
  const counts =
    view === "grade"
      ? getGradeGroupStatusCounts(tree.allMonitoring.gradeLevels)
      : getCoordinatorGroupStatusCounts(tree.allMonitoring.subjectGroups);

  return (
    <Group gap="sm" wrap="nowrap">
      <StatusCircle counts={counts} label={view === "grade" ? "Grade Level" : "Subject Group"} />
      <Text fw={700} size="md" c="#1f2937">
        Reports Monitoring
      </Text>
    </Group>
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
  const [reportsMonitoringView, setReportsMonitoringView] =
    useState<"grade" | "subject-group">("grade");
  const [assignedView, setAssignedView] = useState<"advisory" | "assigned">("advisory");

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
              <ReportsMonitoringAccordionHeader
                tree={tree}
                view={reportsMonitoringView}
              />
            </Accordion.Control>
            <Accordion.Panel>
              <ReportsMonitoring
                tree={tree}
                view={reportsMonitoringView}
                onViewChange={setReportsMonitoringView}
              />
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {reportScope.canViewAssigned && (
          <Accordion.Item value="assigned">
            <Accordion.Control>
              <Group gap="sm" wrap="nowrap">
                <StatusCircle
                  counts={getSectionGroupStatusCounts(
                    assignedView === "advisory"
                      ? tree.assigned.advisorySections
                      : tree.assigned.handledSections,
                  )}
                  label={assignedView === "advisory" ? "Advisory" : "Assigned Subjects"}
                />
                <Text fw={700} size="md" c="#1f2937">Assigned</Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <AssignedReports tree={tree} view={assignedView} onViewChange={setAssignedView} />
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {reportScope.canMonitorGradeLevel && (
          <Accordion.Item value="grade-subject-monitoring">
            <Accordion.Control>
              <MainAccordionHeader
                title="Grade Subject Monitoring"
                counts={getGradeGroupStatusCounts(tree.gradeMonitoring)}
              />
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
              <MainAccordionHeader
                title="Subject Group Monitoring"
                counts={getCoordinatorGroupStatusCounts(tree.subjectGroupMonitoring)}
              />
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
