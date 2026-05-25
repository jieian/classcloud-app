"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon,
  Box,
  Collapse,
  Divider,
  Group,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import { useClickOutside, useDisclosure } from "@mantine/hooks";
import {
  IconAlertTriangle,
  IconChevronRight,
  IconPencil,
} from "@tabler/icons-react";
import type { SubjectCoordinatorRow } from "../_lib/facultyService";
import SubjectBadge from "./SubjectBadge";
import SubjectOverflowCard from "./SubjectOverflowCard";

const MAX_VISIBLE_MEMBERS = 3;

function getGradeLevelSortValue(
  member: SubjectCoordinatorRow["members"][number],
) {
  if (typeof member.grade_level_number === "number") {
    return member.grade_level_number;
  }

  const gradeMatch = member.name.match(/\bgrade\s*(\d)\b/i);
  if (gradeMatch) {
    return Number(gradeMatch[1]);
  }

  return Number.POSITIVE_INFINITY;
}

function sortMembers(members: SubjectCoordinatorRow["members"]) {
  return [...members].sort((a, b) => {
    const gradeDiff = getGradeLevelSortValue(a) - getGradeLevelSortValue(b);
    if (gradeDiff !== 0) return gradeDiff;
    return a.code.localeCompare(b.code);
  });
}

// ── Mobile accordion row ──────────────────────────────────────────────────────

function SubjectCoordinatorMobileRow({
  group,
  onEditCoordinator,
}: {
  group: SubjectCoordinatorRow;
  onEditCoordinator: (group: SubjectCoordinatorRow) => void;
}) {
  const [opened, { toggle }] = useDisclosure(false);

  const sortedMembers = sortMembers(group.members);
  const visibleMembers = sortedMembers.slice(0, MAX_VISIBLE_MEMBERS);
  const overflowMembers = sortedMembers.slice(MAX_VISIBLE_MEMBERS);
  const coordinatorName = group.coordinator
    ? `${group.coordinator.first_name} ${group.coordinator.last_name}`
    : null;

  return (
    <>
      <div onClick={toggle} style={{ cursor: "pointer", padding: "12px 4px" }}>
        <Group justify="space-between" wrap="nowrap" align="center">
          <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <IconChevronRight
              size={16}
              style={{
                transform: opened ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 200ms ease",
                flexShrink: 0,
                color: "#808898",
              }}
            />
            <Group
              gap={6}
              wrap="nowrap"
              align="center"
              style={{ flex: 1, minWidth: 0 }}
            >
              <Text
                fw={500}
                fz="sm"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {group.name}
              </Text>
              {group.coordinator === null && (
                <Tooltip
                  label="No coordinator assigned"
                  withArrow
                  position="top"
                >
                  <IconAlertTriangle
                    size={14}
                    color="#c4a827"
                    style={{ flexShrink: 0 }}
                  />
                </Tooltip>
              )}
            </Group>
          </Group>
          <div onClick={(e) => e.stopPropagation()}>
            <Tooltip label="Edit subject coordinator" withArrow position="left">
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Edit subject coordinator"
                onClick={() => onEditCoordinator(group)}
              >
                <IconPencil size={16} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </div>
        </Group>
      </div>

      <Collapse in={opened}>
        <Box pb="md" pl={28} pr={4}>
          <Text
            size="xs"
            c="dimmed"
            fw={600}
            tt="uppercase"
            mb={2}
            style={{ letterSpacing: "0.04em" }}
          >
            Description
          </Text>
          <Text
            fz="sm"
            c={group.description ? undefined : "dimmed"}
            fs={group.description ? undefined : "italic"}
            mb="sm"
          >
            {group.description ?? "—"}
          </Text>

          <Text
            size="xs"
            c="dimmed"
            fw={600}
            tt="uppercase"
            mb={6}
            style={{ letterSpacing: "0.04em" }}
          >
            Members
          </Text>
          {group.members.length === 0 ? (
            <Text fz="sm" c="dimmed" fs="italic" mb="sm">
              None
            </Text>
          ) : (
            <Group gap={6} wrap="wrap" mb="sm">
              {visibleMembers.map((m) => (
                <SubjectBadge
                  key={m.curriculum_subject_id}
                  code={m.code}
                  subject_type={m.subject_type}
                  subjectName={m.name}
                  palette="coordinator"
                />
              ))}
              {overflowMembers.length > 0 && (
                <SubjectOverflowCard subjects={overflowMembers} />
              )}
            </Group>
          )}

          <Text
            size="xs"
            c="dimmed"
            fw={600}
            tt="uppercase"
            mb={2}
            style={{ letterSpacing: "0.04em" }}
          >
            Subject Coordinator
          </Text>
          {coordinatorName ? (
            <Text fz="sm">{coordinatorName}</Text>
          ) : (
            <Text fz="sm" c="dimmed" fs="italic">
              None
            </Text>
          )}
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface SubjectCoordinatorsTableProps {
  groups: SubjectCoordinatorRow[];
  onEditCoordinator: (group: SubjectCoordinatorRow) => void;
  editingOpen?: boolean;
}

export default function SubjectCoordinatorsTable({
  groups,
  onEditCoordinator,
  editingOpen = false,
}: SubjectCoordinatorsTableProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const tableRef = useClickOutside(() => setSelectedGroupId(null));

  useEffect(() => {
    if (!editingOpen) {
      setSelectedGroupId(null);
    }
  }, [editingOpen]);

  function handleRowClick(group: SubjectCoordinatorRow) {
    if (selectedGroupId === group.subject_group_id) {
      onEditCoordinator(group);
    } else {
      setSelectedGroupId(group.subject_group_id);
    }
  }

  if (groups.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No subject groups found
      </Text>
    );
  }

  const rows = groups.map((group) => {
    const sortedMembers = sortMembers(group.members);
    const visibleMembers = sortedMembers.slice(0, MAX_VISIBLE_MEMBERS);
    const overflowMembers = sortedMembers.slice(MAX_VISIBLE_MEMBERS);
    const isSelected = selectedGroupId === group.subject_group_id;
    const coordinatorName = group.coordinator
      ? `${group.coordinator.first_name} ${group.coordinator.last_name}`
      : null;

    return (
      <TableTr
        key={group.subject_group_id}
        onClick={(e) => {
          e.stopPropagation();
          handleRowClick(group);
        }}
        style={{
          cursor: "pointer",
          backgroundColor: isSelected ? "#f0f7ee" : undefined,
          transition: "background-color 0.15s ease",
        }}
      >
        <TableTd>
          <Group gap={6} wrap="nowrap" align="center">
            <Text size="sm" fw={500}>
              {group.name}
            </Text>
            {group.coordinator === null && (
              <Tooltip label="No coordinator assigned" withArrow position="top">
                <IconAlertTriangle
                  size={14}
                  color="#EF4444"
                  style={{ flexShrink: 0 }}
                />
              </Tooltip>
            )}
          </Group>
        </TableTd>
        <TableTd>
          <Text c="dimmed" size="sm">
            {group.description ?? "--"}
          </Text>
        </TableTd>
        <TableTd>
          {group.members.length === 0 ? (
            <Text c="dimmed" size="sm">
              --
            </Text>
          ) : (
            <Group gap={6} wrap="nowrap">
              {visibleMembers.map((m) => (
                <SubjectBadge
                  key={m.curriculum_subject_id}
                  code={m.code}
                  subject_type={m.subject_type}
                  subjectName={m.name}
                  palette="coordinator"
                />
              ))}
              {overflowMembers.length > 0 && (
                <SubjectOverflowCard subjects={overflowMembers} />
              )}
            </Group>
          )}
        </TableTd>
        <TableTd>
          {coordinatorName ? (
            <Text size="sm">{coordinatorName}</Text>
          ) : (
            <Text c="dimmed" size="sm" fs="italic">
              None
            </Text>
          )}
        </TableTd>
        <TableTd w={40}>
          <Group justify="flex-end" onClick={(e) => e.stopPropagation()}>
            <Tooltip label="Edit subject coordinator" withArrow position="left">
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Edit subject coordinator"
                onClick={() => onEditCoordinator(group)}
              >
                <IconPencil size={16} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </TableTd>
      </TableTr>
    );
  });

  return (
    <>
      {/* Desktop table — hidden on mobile */}
      <div className="hidden sm:block">
        <TableScrollContainer minWidth={1240} type="native" ref={tableRef}>
          <Table
            verticalSpacing="sm"
            horizontalSpacing="md"
            highlightOnHover
            style={{ tableLayout: "fixed" }}
          >
            <colgroup>
              <col style={{ width: "20%" }} />
              <col style={{ width: "21%" }} />
              <col style={{ width: "25%" }} />
              <col style={{ width: "26%" }} />
              <col style={{ width: "40px" }} />
            </colgroup>
            <TableThead>
              <TableTr>
                <TableTh w="20%">Subject Group Name</TableTh>
                <TableTh w="21%">Description</TableTh>
                <TableTh w="25%">Members</TableTh>
                <TableTh w="26%">Subject Coordinator</TableTh>
                <TableTh w={40} ta="right">
                  <VisuallyHidden>Actions</VisuallyHidden>
                </TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>{rows}</TableTbody>
          </Table>
        </TableScrollContainer>
      </div>

      {/* Mobile accordion list — hidden on sm+ */}
      <div className="sm:hidden">
        <Divider />
        {groups.map((group) => (
          <SubjectCoordinatorMobileRow
            key={group.subject_group_id}
            group={group}
            onEditCoordinator={onEditCoordinator}
          />
        ))}
      </div>
    </>
  );
}
