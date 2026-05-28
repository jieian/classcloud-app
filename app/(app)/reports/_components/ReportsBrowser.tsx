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
  IconChalkboardTeacher,
  IconRefresh,
  IconUserCog,
  IconUserEdit,
} from "@tabler/icons-react";
import { useMediaQuery } from "@mantine/hooks";
import EmptySearchState from "@/components/EmptySearchState";
import { useAuth } from "@/context/AuthContext";
import { useReportPermissions } from "@/hooks/useReportPermissions";
import {
  invalidateReportsCache,
  type ReportMonitoringCoordinatorGroup,
  type ReportMonitoringGradeGroup,
  type ReportMonitoringRow,
  type ReportMonitoringSectionGroup,
  type ReportMonitoringSubjectGroup,
  type ReportMonitoringTree,
} from "@/lib/services/reportsAnalysisService";

async function fetchReportMonitoringTreeFromApi(): Promise<ReportMonitoringTree> {
  const response = await fetch("/api/reports/monitoring-tree", {
    credentials: "include",
    cache: "no-store",
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result?.error || "Failed to load reports.");
  }

  return result as ReportMonitoringTree;
}

const emptyTree: ReportMonitoringTree = {
  assigned: { advisorySections: [], handledSections: [] },
  gradeMonitoring: [],
  subjectGroupMonitoring: [],
  allMonitoring: { gradeLevels: [], subjectGroups: [] },
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

/** Single-slot registry — only one popover/tooltip open at a time on touch */
const activePopover = { close: null as (() => void) | null };

function useClickTooltip() {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!opened) return;
    function handleOutside() {
      setOpened(false);
      activePopover.close = null;
    }
    // Defer so the opening click doesn't immediately close
    const id = setTimeout(() => {
      document.addEventListener("pointerdown", handleOutside, { once: true });
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("pointerdown", handleOutside);
    };
  }, [opened]);

  function toggle(e: React.MouseEvent | React.TouchEvent) {
    e.stopPropagation();
    if (opened) {
      setOpened(false);
      activePopover.close = null;
    } else {
      activePopover.close?.();
      setOpened(true);
      activePopover.close = () => setOpened(false);
    }
  }

  return { opened, toggle };
}


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


function classifySubgroupFromCounts(counts: StatusCounts): keyof StatusCounts {
  const total = statusCountsTotal(counts);
  if (total === 0) return "notStarted";
  if (counts.done === total) return "done";
  if (counts.notStarted === total) return "notStarted";
  return "ongoing";
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

  // On touch: close when tapping anywhere outside
  useEffect(() => {
    if (!opened || !isTouchDevice) return;
    const id = setTimeout(() => {
      function handleOutside() {
        setOpened(false);
        activePopover.close = null;
      }
      document.addEventListener("pointerdown", handleOutside, { once: true });
    }, 0);
    return () => clearTimeout(id);
  }, [opened, isTouchDevice]);

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
    if (!isTouchDevice) return;
    event.stopPropagation();
    if (opened) {
      setOpened(false);
      activePopover.close = null;
    } else {
      activePopover.close?.();
      setOpened(true);
      activePopover.close = () => setOpened(false);
    }
  }

  const statusItems = [
    { label: "Done", count: counts.done, color: STATUS_COLORS.done },
    { label: "Ongoing", count: counts.ongoing, color: STATUS_COLORS.ongoing },
    { label: "Not Started", count: counts.notStarted, color: STATUS_COLORS.notStarted },
  ];

  return (
    <Popover
      opened={opened}
      onClose={() => { setOpened(false); activePopover.close = null; }}
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

function StatusProgressBar({ counts, label }: { counts: StatusCounts; label: string }) {
  const [opened, setOpened] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const total = statusCountsTotal(counts);
  const doneWidth = total === 0 ? 0 : (counts.done / total) * 100;
  const ongoingWidth = total === 0 ? 0 : (counts.ongoing / total) * 100;
  const notStartedWidth = total === 0 ? 100 : (counts.notStarted / total) * 100;
  const isTouchDevice =
    typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;

  useEffect(() => {
    if (!opened || !isTouchDevice) return;
    const id = setTimeout(() => {
      function handleOutside() {
        setOpened(false);
        activePopover.close = null;
      }
      document.addEventListener("pointerdown", handleOutside, { once: true });
    }, 0);
    return () => clearTimeout(id);
  }, [opened, isTouchDevice]);

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
    if (!isTouchDevice) return;
    event.stopPropagation();
    if (opened) {
      setOpened(false);
      activePopover.close = null;
    } else {
      activePopover.close?.();
      setOpened(true);
      activePopover.close = () => setOpened(false);
    }
  }

  const statusItems = [
    { label: "Done", count: counts.done, color: STATUS_COLORS.done },
    { label: "Ongoing", count: counts.ongoing, color: STATUS_COLORS.ongoing },
    { label: "Not Started", count: counts.notStarted, color: STATUS_COLORS.notStarted },
  ];

  return (
    <Popover
      opened={opened}
      onClose={() => { setOpened(false); activePopover.close = null; }}
      width={220}
      shadow="sm"
      withinPortal
      position="right"
      closeOnClickOutside={isTouchDevice}
    >
      <Popover.Target>
        <Box
          aria-label={`${label} progress`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          style={{
            width: 210,
            maxWidth: "32vw",
            minWidth: 90,
            height: 14,
            borderRadius: 4,
            backgroundColor: STATUS_COLORS.notStarted,
            display: "flex",
            overflow: "hidden",
            flexShrink: 0,
            cursor: isTouchDevice ? "pointer" : "default",
          }}
        >
          {doneWidth > 0 && (
            <Box style={{ width: `${doneWidth}%`, backgroundColor: STATUS_COLORS.done }} />
          )}
          {ongoingWidth > 0 && (
            <Box style={{ width: `${ongoingWidth}%`, backgroundColor: STATUS_COLORS.ongoing }} />
          )}
          {notStartedWidth > 0 && total > 0 && (
            <Box style={{ width: `${notStartedWidth}%`, backgroundColor: STATUS_COLORS.notStarted }} />
          )}
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

function RoleIconButton({
  personName,
  roleLabel,
  roleIcon,
}: {
  personName?: string | null;
  roleLabel?: string;
  roleIcon?: ReactNode;
}) {
  const { opened, toggle } = useClickTooltip();
  const isMobile = useMediaQuery("(max-width: 600px)");

  if (roleIcon === undefined) return null;

  if (isMobile) {
    return (
      <Tooltip label={personName ?? "Unassigned"} withArrow position="top" opened={opened}>
        <ActionIcon variant="subtle" color="gray" size="sm" onClick={toggle}>
          {roleIcon}
        </ActionIcon>
      </Tooltip>
    );
  }

  return (
    <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
      <Tooltip label={roleLabel ?? ""} withArrow position="top">
        <span style={{ display: "flex", alignItems: "center", color: "#6b7280" }}>
          {roleIcon}
        </span>
      </Tooltip>
      <Text size="sm" c={personName ? undefined : "dimmed"} style={{ whiteSpace: "nowrap" }}>
        {personName ?? "Unassigned"}
      </Text>
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

// Status-only row (no View button) — used inside HandledSubjectsAccordion panels
function SubjectSectionStatusRow({
  row,
  label,
  isLast = false,
  showTeacher = true,
}: {
  row: ReportMonitoringRow;
  label: string;
  isLast?: boolean;
  showTeacher?: boolean;
}) {
  return (
    <Group
      justify="space-between"
      gap="sm"
      py="xs"
      pl={24}
      pr={12}
      wrap="nowrap"
      className={`relative hover:bg-gray-50 before:absolute before:left-[-13px] before:top-0 before:w-[2px] before:bg-[#d1d5db] before:content-[''] after:absolute after:left-[-13px] after:top-1/2 after:h-[2px] after:w-[18px] after:-translate-y-1/2 after:bg-[#d1d5db] after:content-[''] [&_.tree-node]:absolute [&_.tree-node]:left-[1px] [&_.tree-node]:top-1/2 [&_.tree-node]:h-[8px] [&_.tree-node]:w-[8px] [&_.tree-node]:-translate-y-1/2 [&_.tree-node]:bg-[#d1d5db] ${
        isLast ? "before:bottom-1/2" : "before:bottom-0"
      }`}
      style={{ borderBottom: "1px solid #e5e7eb", marginRight: -12 }}
    >
      <span className="tree-node" aria-hidden="true" />
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: showTeacher ? "150px 108px max-content" : "150px 108px",
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
        {showTeacher && (
          <Group gap={4} wrap="nowrap" ml={4}>
            <Tooltip label="Subject Teacher" withArrow position="top">
              <IconChalkboardTeacher size={15} stroke={1.7} color="#6b7280" />
            </Tooltip>
            <Text size="sm" c={row.teacherName ? undefined : "dimmed"} style={{ whiteSpace: "nowrap" }}>
              {row.teacherName ?? "Unassigned"}
            </Text>
          </Group>
        )}
      </Box>
    </Group>
  );
}

// Subject-level row with View button — used in GradeMonitoring and SubjectGroupMonitoring
// Always-open subject panels (no toggle) with section-status rows and a View button per subject
function SubjectMonitoringList({
  subjects,
  emptyMessage,
  showGrade = false,
  from,
  collapsible = false,
  subjectStatusDisplay = "circle",
}: {
  subjects: ReportMonitoringSubjectGroup[];
  emptyMessage: string;
  showGrade?: boolean;
  from?: string;
  collapsible?: boolean;
  subjectStatusDisplay?: "circle" | "bar";
}) {
  const router = useRouter();
  const [openSubjects, setOpenSubjects] = useState<string[]>([]);

  if (subjects.length === 0) return <EmptyPanel message={emptyMessage} />;

  const sorted = [...subjects].sort(
    (a, b) =>
      (a.gradeLevelNumber ?? 99) - (b.gradeLevelNumber ?? 99) ||
      a.subjectName.localeCompare(b.subjectName),
  );

  if (collapsible) {
    return (
      <Accordion
        multiple
        value={openSubjects}
        onChange={setOpenSubjects}
        variant="separated"
        styles={subAccordionStyles}
      >
        {sorted.map((subject) => {
          const label = showGrade
            ? `${subject.gradeDisplayName} \u2022 ${subject.subjectName}`
            : subject.subjectName;
          const sectionIds = [...new Set(subject.rows.map((row) => row.sectionId))];
          const params = new URLSearchParams();
          if (from) params.set("from", from);
          if (from === "subject" && sectionIds.length > 0) params.set("sections", sectionIds.join(","));
          const query = params.toString();
          const href = `/reports/subject/${subject.gradeLevelId}/${subject.subjectId}${query ? `?${query}` : ""}`;
          return (
            <Accordion.Item
              key={subject.curriculumSubjectId}
              value={`subject-${subject.curriculumSubjectId}`}
            >
              <Accordion.Control>
                <Group justify="space-between" wrap="nowrap" style={{ minWidth: 0, paddingRight: 4 }}>
                  <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                    {subjectStatusDisplay === "bar" ? (
                      <StatusProgressBar counts={getRowStatusCounts(subject.rows)} label={label} />
                    ) : (
                      <StatusCircle counts={getRowStatusCounts(subject.rows)} label={label} />
                    )}
                    <Tooltip label={label} position="top-start" withArrow disabled={label.length < 28}>
                      <Text fw={700} size="md" truncate="end" maw={220}>
                        {label}
                      </Text>
                    </Tooltip>
                    <RoleIconButton
                      personName={subject.leaderName}
                      roleLabel="Subject Leader"
                      roleIcon={<IconUserEdit size={14} stroke={1.7} />}
                    />
                  </Group>
                  <Tooltip label="View report" position="top" withArrow withinPortal>
                    <Box
                      component="span"
                      onClick={(e) => { e.stopPropagation(); router.push(href); }}
                      style={{
                        alignItems: "center",
                        backgroundColor: "#4EAE4A",
                        borderRadius: 4,
                        color: "#ffffff",
                        cursor: "pointer",
                        display: "inline-flex",
                        fontSize: 12,
                        fontWeight: 600,
                        height: 26,
                        lineHeight: 1,
                        paddingInline: 8,
                        userSelect: "none",
                      }}
                    >
                      View
                    </Box>
                  </Tooltip>
                </Group>
              </Accordion.Control>
              <Accordion.Panel
                onDoubleClick={(event) => {
                  setOpenSubjects((current) =>
                    current.filter((value) => value !== `subject-${subject.curriculumSubjectId}`),
                  );
                  keepClosedAccordionInView(event);
                }}
              >
                <TreeGuide>
                  {subject.rows.map((row, index) => (
                    <SubjectSectionStatusRow
                      key={`${row.sectionId}-${row.curriculumSubjectId}`}
                      row={row}
                      label={row.sectionName}
                      isLast={index === subject.rows.length - 1}
                    />
                  ))}
                </TreeGuide>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>
    );
  }

  return (
    <Stack gap={8}>
      {sorted.map((subject) => {
        const label = showGrade
          ? `${subject.gradeDisplayName} • ${subject.subjectName}`
          : subject.subjectName;
        const sectionIds = [...new Set(subject.rows.map((row) => row.sectionId))];
        const params = new URLSearchParams();
        if (from) params.set("from", from);
        if (from === "subject" && sectionIds.length > 0) params.set("sections", sectionIds.join(","));
        const query = params.toString();
        const href = `/reports/subject/${subject.gradeLevelId}/${subject.subjectId}${query ? `?${query}` : ""}`;
        return (
          <Box
            key={subject.curriculumSubjectId}
            style={{
              border: "1px solid #D6D9E0",
              borderRadius: 6,
              backgroundColor: "#ffffff",
              overflow: "hidden",
            }}
          >
            {/* Subject header — always visible, no toggle */}
            <Group
              justify="space-between"
              wrap="nowrap"
              px={14}
              py={10}
              style={{ borderBottom: "1px solid #e5e7eb", minWidth: 0 }}
            >
              <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                {subjectStatusDisplay === "bar" ? (
                  <>
                    <Tooltip label={label} position="top-start" withArrow disabled={label.length < 28}>
                      <Text fw={700} size="md" truncate="end" maw={220}>
                        {label}
                      </Text>
                    </Tooltip>
                    <StatusProgressBar counts={getRowStatusCounts(subject.rows)} label={label} />
                    <RoleIconButton
                      personName={subject.leaderName}
                      roleLabel="Subject Leader"
                      roleIcon={<IconUserEdit size={14} stroke={1.7} />}
                    />
                  </>
                ) : (
                  <StatusCircle counts={getRowStatusCounts(subject.rows)} label={label} />
                )}
                {subjectStatusDisplay !== "bar" && (
                  <Tooltip label={label} position="top-start" withArrow disabled={label.length < 28}>
                    <Text fw={700} size="md" truncate="end" maw={220}>
                      {label}
                    </Text>
                  </Tooltip>
                )}
                {subjectStatusDisplay !== "bar" && (
                  <RoleIconButton
                    personName={subject.leaderName}
                    roleLabel="Subject Leader"
                    roleIcon={<IconUserEdit size={14} stroke={1.7} />}
                  />
                )}
              </Group>
              <Tooltip label="View report" position="top" withArrow withinPortal>
                <Button
                  size="compact-sm"
                  color="#4EAE4A"
                  px={6}
                  onClick={() => router.push(href)}
                >
                  View
                </Button>
              </Tooltip>
            </Group>
            {/* Section rows — always visible */}
            <Box px={12} pb={8}>
              <TreeGuide>
                {subject.rows.map((row, index) => (
                  <SubjectSectionStatusRow
                    key={`${row.sectionId}-${row.curriculumSubjectId}`}
                    row={row}
                    label={row.sectionName}
                    isLast={index === subject.rows.length - 1}
                  />
                ))}
              </TreeGuide>
            </Box>
          </Box>
        );
      })}
    </Stack>
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
  from,
}: {
  sections: ReportMonitoringSectionGroup[];
  rowLabel: (row: ReportMonitoringRow) => string;
  emptyMessage: string;
  from?: string;
}) {
  const router = useRouter();
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
      {sections.map((section) => {
        const viewHref = `/reports/${section.gradeLevelId}/${section.sectionId}${from ? `?from=${from}` : ""}`;
        const label = `${section.gradeDisplayName} • ${section.sectionName}`;
        return (
          <Accordion.Item
            key={section.sectionId}
            value={`section-${section.sectionId}`}
          >
            <Accordion.Control>
            <Group justify="space-between" wrap="nowrap" style={{ minWidth: 0, paddingRight: 4 }}>
              <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                <StatusCircle counts={getRowStatusCounts(section.rows)} label={label} />
                <Tooltip label={label} position="top-start" withArrow disabled={label.length < 28}>
                  <Text fw={700} size="md" truncate="end" maw={220}>{label}</Text>
                </Tooltip>
              </Group>
              <Box
                component="span"
                onClick={(event) => {
                  event.stopPropagation();
                  router.push(viewHref);
                }}
                style={{
                  alignItems: "center",
                  backgroundColor: "#4EAE4A",
                  borderRadius: 4,
                  color: "#ffffff",
                  cursor: "pointer",
                  display: "inline-flex",
                  fontSize: 12,
                  fontWeight: 600,
                  height: 26,
                  lineHeight: 1,
                  paddingInline: 8,
                  userSelect: "none",
                }}
              >
                View
              </Box>
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
                  <SubjectSectionStatusRow
                    key={`${row.sectionId}-${row.curriculumSubjectId}`}
                    row={row}
                    label={rowLabel(row)}
                    isLast={index === section.rows.length - 1}
                  />
                ))}
              </TreeGuide>
            </Accordion.Panel>
          </Accordion.Item>
        );
      })}
    </Accordion>
  );
}

function HandledSubjectsAccordion({
  subjects,
}: {
  subjects: ReportMonitoringSubjectGroup[];
}) {
  const [openSubjects, setOpenSubjects] = useState<string[]>([]);
  const router = useRouter();

  if (subjects.length === 0) return <EmptyPanel message="No assigned subjects found." />;

  return (
    <Accordion
      multiple
      value={openSubjects}
      onChange={setOpenSubjects}
      variant="separated"
      styles={subAccordionStyles}
    >
      {subjects.map((subject) => {
        const handledSectionIds = [
          ...new Set(subject.rows.map((row) => row.sectionId)),
        ].sort((a, b) => a - b);
        const href = `/reports/subject/${subject.gradeLevelId}/${subject.subjectId}?from=assigned&sections=${handledSectionIds.join(",")}`;
        return (
          <Accordion.Item
            key={subject.curriculumSubjectId}
            value={`subject-${subject.curriculumSubjectId}`}
          >
            <Accordion.Control>
              <Group justify="space-between" wrap="nowrap" style={{ minWidth: 0, paddingRight: 4 }}>
                <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                  <StatusCircle counts={getRowStatusCounts(subject.rows)} label={subject.subjectName} />
                  <Text fw={700} size="md" truncate="end" maw={220}>{subject.subjectName}</Text>
                </Group>
                <Tooltip label="View report" position="top" withArrow withinPortal>
                  <Box
                    component="span"
                    onClick={(e) => { e.stopPropagation(); router.push(href); }}
                    style={{
                      alignItems: "center",
                      backgroundColor: "#4EAE4A",
                      borderRadius: 4,
                      color: "#ffffff",
                      cursor: "pointer",
                      display: "inline-flex",
                      fontSize: 12,
                      fontWeight: 600,
                      height: 26,
                      lineHeight: 1,
                      paddingInline: 8,
                      userSelect: "none",
                    }}
                  >
                    View
                  </Box>
                </Tooltip>
              </Group>
            </Accordion.Control>
            <Accordion.Panel
              onDoubleClick={(event) => {
                setOpenSubjects((current) =>
                  current.filter((v) => v !== `subject-${subject.curriculumSubjectId}`),
                );
                keepClosedAccordionInView(event);
              }}
            >
              <TreeGuide>
                {subject.rows.map((row, index) => (
                  <SubjectSectionStatusRow
                    key={`${row.sectionId}-${row.curriculumSubjectId}`}
                    row={row}
                    label={`${row.gradeDisplayName} • ${row.sectionName}`}
                    isLast={index === subject.rows.length - 1}
                    showTeacher={false}
                  />
                ))}
              </TreeGuide>
            </Accordion.Panel>
          </Accordion.Item>
        );
      })}
    </Accordion>
  );
}

function GradeMonitoring({
  grades,
  emptyMessage,
  from,
}: {
  grades: ReportMonitoringGradeGroup[];
  emptyMessage: string;
  from?: string;
}) {
  const allSubjects = grades.flatMap((g) => g.subjects);

  return (
    <SubjectMonitoringList
      subjects={allSubjects}
      emptyMessage={emptyMessage}
      showGrade={true}
      from={from}
      collapsible
    />
  );
}

function SubjectGroupMonitoring({
  groups,
  emptyMessage,
  from,
}: {
  groups: ReportMonitoringCoordinatorGroup[];
  emptyMessage: string;
  from?: string;
}) {
  return (
    <ReportsSubjectGroupMonitoring
      groups={groups}
      emptyMessage={emptyMessage}
      from={from}
    />
  );
}

function ReportsSubjectGroupMonitoring({
  groups,
  emptyMessage,
  from,
}: {
  groups: ReportMonitoringCoordinatorGroup[];
  emptyMessage: string;
  from?: string;
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
          value={`reports-subject-group-${group.subjectGroupId}`}
        >
          <Accordion.Control>
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              <StatusCircle
                counts={getSubjectSubgroupStatusCounts(group.subjects)}
                label={group.subjectGroupName}
              />
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
              <RoleIconButton
                personName={group.coordinatorName}
                roleLabel="Subject Coordinator"
                roleIcon={<IconUserCog size={14} stroke={1.7} />}
              />
            </Group>
          </Accordion.Control>
          <Accordion.Panel
            onDoubleClick={(event) => {
              setOpenGroups((current) =>
                current.filter((value) => value !== `reports-subject-group-${group.subjectGroupId}`),
              );
              keepClosedAccordionInView(event);
            }}
          >
            <SubjectMonitoringList
              subjects={group.subjects}
              emptyMessage="No subject rows are available for this group."
              showGrade={true}
              from={from}
              subjectStatusDisplay="bar"
            />
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

function AdvisoryList({ sections }: { sections: ReportMonitoringSectionGroup[] }) {
  const router = useRouter();
  if (sections.length === 0) return <EmptyPanel message="No advisory reports found." />;
  return (
    <Stack gap="xs">
      {sections.map((section) => {
        const href = `/reports/${section.gradeLevelId}/${section.sectionId}?from=advisory`;
        return (
          <Group
            key={section.sectionId}
            justify="space-between"
            align="center"
            wrap="nowrap"
            px="sm"
            py="xs"
            className="rounded-lg border border-[#E5E7EB] bg-white hover:bg-gray-50"
          >
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              <StatusCircle
                counts={getRowStatusCounts(section.rows)}
                label={`${section.gradeDisplayName} • ${section.sectionName}`}
              />
              <Text fw={700} size="md" truncate="end" maw={260}>
                {section.gradeDisplayName}
                {" • "}
                {section.sectionName}
              </Text>
            </Group>
            <Button
              size="compact-sm"
              color="#4EAE4A"
              px={6}
              onClick={() => router.push(href)}
            >
              View
            </Button>
          </Group>
        );
      })}
    </Stack>
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

  // Group handled sections by curriculum subject → subject-first view
  const handledSubjectGroups = useMemo<ReportMonitoringSubjectGroup[]>(() => {
    const map = new Map<number, ReportMonitoringSubjectGroup>();
    for (const section of tree.assigned.handledSections) {
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
  }, [tree.assigned.handledSections]);

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
            { value: "assigned", label: "Subjects" },
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
          from="advisory"
        />
      ) : (
        <HandledSubjectsAccordion
          subjects={handledSubjectGroups}
        />
      )}
    </Stack>
  );
}

function ReportsMonitoring({ tree }: { tree: ReportMonitoringTree }) {
  return (
    <ReportsSubjectGroupMonitoring
      groups={tree.allMonitoring.subjectGroups}
      emptyMessage="No subject group reports found."
      from="all"
    />
  );
}

function ReportsMonitoringAccordionHeader({ tree }: { tree: ReportMonitoringTree }) {
  const counts = getCoordinatorGroupStatusCounts(tree.allMonitoring.subjectGroups);

  return (
    <Group gap="sm" wrap="nowrap">
      <StatusCircle counts={counts} label="Subject Group" />
      <Text fw={700} size="md" c="#1f2937">
        Reports Monitoring
      </Text>
    </Group>
  );
}

function FixedReportSection({
  header,
  children,
}: {
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box
      style={{
        border: "1px solid #e2edff",
        borderRadius: 6,
        backgroundColor: "#ffffff",
        overflow: "hidden",
      }}
    >
      <Box
        px="md"
        py="sm"
        style={{
          alignItems: "center",
          backgroundColor: "#F5F5F5",
          display: "flex",
          minHeight: 60,
        }}
      >
        {header}
      </Box>
      <Box p="sm">
        {children}
      </Box>
    </Box>
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
  const [assignedView, setAssignedView] = useState<"advisory" | "assigned">("advisory");

  const loadData = async (forceRefresh = false) => {
    setLoading(true);
    setLoadError(null);
    try {
      if (forceRefresh) invalidateReportsCache();
      setTree(await fetchReportMonitoringTreeFromApi());
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
      <Box>
        <h1 className="text-3xl font-bold text-[#597D37]">Reports</h1>
        <Box style={{ minWidth: 0 }}>
          <p className="text-sm text-[#808898]">Monitor finalized assessment reports</p>
        </Box>
        <Tooltip label="Refresh" position="bottom" withArrow>
          <ActionIcon
            variant="outline"
            color="#808898"
            size="lg"
            radius="xl"
            mt="xs"
            onClick={() => void loadData(true)}
            loading={loading}
            aria-label="Refresh reports"
          >
            <IconRefresh size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Box>

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

      <Stack gap="md">
        {reportScope.canViewAssigned && (
          <FixedReportSection
            header={
              <Group gap="sm" wrap="nowrap">
                <Text fw={700} size="md" c="#1f2937">My Advisory &amp; Subjects</Text>
              </Group>
            }
          >
              <AssignedReports
                tree={tree}
                view={assignedView}
                onViewChange={setAssignedView}
              />
          </FixedReportSection>
        )}

        {reportScope.canMonitorGradeLevel && (
          <FixedReportSection
            header={<Text fw={700} size="md" c="#1f2937">Grade Subject Monitoring</Text>}
          >
              <GradeMonitoring
                grades={tree.gradeMonitoring}
                emptyMessage="No active grade subject leader assignment found for this school year."
                from="grade"
              />
          </FixedReportSection>
        )}

        {reportScope.canMonitorSubjects && (
          <FixedReportSection
            header={<Text fw={700} size="md" c="#1f2937">Subject Group Monitoring</Text>}
          >
              <SubjectGroupMonitoring
                groups={tree.subjectGroupMonitoring}
                emptyMessage="No active subject group assignment found for this school year."
                from="subject"
              />
          </FixedReportSection>
        )}

        {reportScope.canViewAll && (
          <FixedReportSection
            header={<ReportsMonitoringAccordionHeader tree={tree} />}
          >
              <ReportsMonitoring tree={tree} />
          </FixedReportSection>
        )}
      </Stack>
    </div>
  );
}
