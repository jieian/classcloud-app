"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
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
import { IconAlertTriangle, IconChevronRight, IconPencil } from "@tabler/icons-react";
import type { SubjectLeaderEntry } from "../_lib/facultyService";

interface GradeSubjectLeadersTableProps {
  subjects: SubjectLeaderEntry[];
  onEdit: (entry: SubjectLeaderEntry) => void;
  editingOpen?: boolean;
}

function sortSubjects(subjects: SubjectLeaderEntry[]): SubjectLeaderEntry[] {
  return [...subjects].sort((a, b) => {
    const aNoLeader = a.leader === null ? 0 : 1;
    const bNoLeader = b.leader === null ? 0 : 1;
    if (aNoLeader !== bNoLeader) return aNoLeader - bNoLeader;

    const aSSES = a.subject_type === "SSES" ? 0 : 1;
    const bSSES = b.subject_type === "SSES" ? 0 : 1;
    if (aSSES !== bSSES) return aSSES - bSSES;

    return a.subject_name.localeCompare(b.subject_name);
  });
}

function SsesLabel() {
  return (
    <Badge
      size="xs"
      variant="filled"
      radius="xl"
      style={{ backgroundColor: "#70A2FF", color: "#fff", flexShrink: 0 }}
    >
      SSES
    </Badge>
  );
}

// ── Mobile row ────────────────────────────────────────────────────────────────

function GradeSubjectLeaderMobileRow({
  entry,
  onEdit,
}: {
  entry: SubjectLeaderEntry;
  onEdit: (entry: SubjectLeaderEntry) => void;
}) {
  const [opened, { toggle }] = useDisclosure(false);
  const leaderName = entry.leader
    ? `${entry.leader.first_name} ${entry.leader.last_name}`
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
            <Group gap={6} wrap="nowrap" align="center" style={{ flex: 1, minWidth: 0 }}>
              <Text
                fw={500}
                fz="sm"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {entry.subject_name}
              </Text>
              {entry.subject_type === "SSES" && <SsesLabel />}
              {entry.leader === null && (
                <Tooltip label="No grade subject leader assigned" withArrow position="top">
                  <IconAlertTriangle size={14} color="#c4a827" style={{ flexShrink: 0 }} />
                </Tooltip>
              )}
            </Group>
          </Group>
          <div onClick={(e) => e.stopPropagation()}>
            <Tooltip label="Edit grade subject leader" withArrow position="left">
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Edit grade subject leader"
                onClick={() => onEdit(entry)}
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
            c={entry.subject_description ? undefined : "dimmed"}
            fs={entry.subject_description ? undefined : "italic"}
            mb="sm"
          >
            {entry.subject_description ?? "—"}
          </Text>

          <Text
            size="xs"
            c="dimmed"
            fw={600}
            tt="uppercase"
            mb={2}
            style={{ letterSpacing: "0.04em" }}
          >
            Grade Subject Leader
          </Text>
          {leaderName ? (
            <Text fz="sm">{leaderName}</Text>
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

export default function GradeSubjectLeadersTable({
  subjects,
  onEdit,
  editingOpen = false,
}: GradeSubjectLeadersTableProps) {
  const sorted = useMemo(() => sortSubjects(subjects), [subjects]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const tableRef = useClickOutside(() => setSelectedId(null));

  useEffect(() => {
    if (!editingOpen) setSelectedId(null);
  }, [editingOpen]);

  if (sorted.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No subjects found for this grade level.
      </Text>
    );
  }

  function handleRowClick(entry: SubjectLeaderEntry) {
    if (selectedId === entry.curriculum_subject_id) {
      onEdit(entry);
    } else {
      setSelectedId(entry.curriculum_subject_id);
    }
  }

  const rows = sorted.map((entry) => {
    const leaderName = entry.leader
      ? `${entry.leader.first_name} ${entry.leader.last_name}`
      : null;
    const isSelected = selectedId === entry.curriculum_subject_id;

    return (
      <TableTr
        key={entry.curriculum_subject_id}
        onClick={(e) => { e.stopPropagation(); handleRowClick(entry); }}
        style={{
          cursor: "pointer",
          backgroundColor: isSelected ? "#f0f7ee" : undefined,
          transition: "background-color 0.15s ease",
        }}
      >
        <TableTd>
          <Group gap={6} wrap="nowrap" align="center">
            <Text size="sm" fw={500}>
              {entry.subject_name}
            </Text>
            {entry.subject_type === "SSES" && <SsesLabel />}
            {entry.leader === null && (
              <Tooltip label="No grade subject leader assigned" withArrow position="top">
                <IconAlertTriangle
                  size={14}
                  color="#c4a827"
                  style={{ flexShrink: 0 }}
                />
              </Tooltip>
            )}
          </Group>
        </TableTd>
        <TableTd>
          <Text c="dimmed" size="sm">
            {entry.subject_description ?? "--"}
          </Text>
        </TableTd>
        <TableTd>
          {leaderName ? (
            <Text size="sm">{leaderName}</Text>
          ) : (
            <Text c="dimmed" size="sm" fs="italic">
              None
            </Text>
          )}
        </TableTd>
        <TableTd w={40}>
          <Group justify="flex-end" onClick={(e) => e.stopPropagation()}>
            <Tooltip label="Edit grade subject leader" withArrow position="left">
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Edit grade subject leader"
                onClick={() => onEdit(entry)}
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
      {/* Desktop table */}
      <div className="hidden sm:block">
        <TableScrollContainer minWidth={600} type="native" ref={tableRef}>
          <Table
            verticalSpacing="sm"
            horizontalSpacing="md"
            highlightOnHover
            style={{ tableLayout: "fixed" }}
          >
            <colgroup>
              <col style={{ width: "28%" }} />
              <col style={{ width: "37%" }} />
              <col style={{ width: "27%" }} />
              <col style={{ width: "40px" }} />
            </colgroup>
            <TableThead>
              <TableTr>
                <TableTh>Subject Name</TableTh>
                <TableTh>Description</TableTh>
                <TableTh>Grade Subject Leader</TableTh>
                <TableTh w={40} ta="right">
                  <VisuallyHidden>Actions</VisuallyHidden>
                </TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>{rows}</TableTbody>
          </Table>
        </TableScrollContainer>
      </div>

      {/* Mobile accordion */}
      <div className="sm:hidden">
        <Divider />
        {sorted.map((entry) => (
          <GradeSubjectLeaderMobileRow
            key={entry.curriculum_subject_id}
            entry={entry}
            onEdit={onEdit}
          />
        ))}
      </div>
    </>
  );
}
