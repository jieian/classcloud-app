"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SubjectBadge from "@/app/(app)/school/faculty/_components/SubjectBadge";
import SubjectOverflowCard from "@/app/(app)/school/faculty/_components/SubjectOverflowCard";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Collapse,
  Divider,
  Group,
  Modal,
  Paper,
  Stack,
  Switch,
  Table,
  TableScrollContainer,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { notify } from "@/components/notificationIcon/notificationIcon";
import {
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconExternalLink,
  IconInfoCircle,
  IconTrash,
} from "@tabler/icons-react";

// ── Public types ───────────────────────────────────────────────────────────────

export interface SchoolYearDetail {
  sy_id: number;
  year_range: string;
  start_year: number;
  end_year: number;
  is_active: boolean;
  curriculum_id: number;
  curriculum_name: string;
  quarters: {
    quarter_id: number;
    name: string;
    is_active: boolean;
    sy_id: number;
  }[];
  coordinators: {
    sc_id: number;
    subject_group_id: number;
    subject_group_name: string;
    members: { curriculum_subject_id: number; code: string; name: string }[];
    coordinator_name: string | null;
  }[];
  grade_levels: {
    grade_level_id: number;
    name: string;
    display_name: string;
    subjects: {
      curriculum_subject_id: number;
      code: string;
      name: string;
      subject_type: string;
    }[];
    sections: {
      section_id: number;
      name: string;
      section_type: string;
      adviser_name: string | null;
      assignments: {
        curriculum_subject_id: number;
        teacher_name: string | null;
      }[];
    }[];
  }[];
  hasExams: boolean;
}

interface Props {
  detail: SchoolYearDetail;
}

const MAX_VISIBLE_MEMBERS = 3;

const reviewTh: CSSProperties = {
  backgroundColor: "#4EAE4A",
  color: "#fff",
  fontWeight: 600,
  padding: "6px 12px",
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function SchoolYearDetailClient({ detail }: Props) {
  const router = useRouter();
  const [quarters, setQuarters] = useState(detail.quarters);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deleteOpened, setDeleteOpened] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const numQuarters = quarters.length;
  const termLabel = numQuarters === 4 ? "Quarters" : "Terms";

  async function handleQuarterToggle(quarter_id: number) {
    if (togglingId !== null) return;
    const already = quarters.find(
      (q) => q.quarter_id === quarter_id,
    )?.is_active;
    if (already) return;

    setTogglingId(quarter_id);
    try {
      const res = await fetch("/api/schoolYear/toggle-quarter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quarter_id, sy_id: detail.sy_id }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json.error === "REPORTS_INCOMPLETE") {
          notify({
            type: "error",
            title: "Cannot switch term",
            message:
              "All exam reports for the current term must be submitted before switching.",
          });
        } else {
          notify({
            type: "error",
            title: "Error",
            message: json.error ?? "Failed to switch term.",
          });
        }
        return;
      }

      setQuarters((prev) =>
        prev.map((q) => ({ ...q, is_active: q.quarter_id === quarter_id })),
      );
      notify({
        type: "success",
        title: "Term switched",
        message: `Active term updated successfully.`,
      });
      router.refresh();
    } catch {
      notify({
        type: "error",
        title: "Error",
        message: "An unexpected error occurred.",
      });
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete() {
    if (confirmText.toLowerCase() !== "delete") return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/schoolYear/hard-delete/${detail.sy_id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json();
        notify({
          type: "error",
          title: "Delete failed",
          message: json.error ?? "Failed to delete school year.",
        });
        return;
      }
      notify({
        type: "success",
        title: "School year deleted",
        message: `${detail.year_range} has been permanently deleted.`,
      });
      router.push("/school/year");
    } catch {
      notify({
        type: "error",
        title: "Error",
        message: "An unexpected error occurred.",
      });
    } finally {
      setDeleting(false);
    }
  }

  function handleCloseDelete() {
    if (deleting) return;
    setDeleteOpened(false);
    setConfirmText("");
  }

  return (
    <>
      <Group justify="space-between" align="flex-start" mb="lg">
        <Group align="center" gap="sm" mt="md">
          <Title order={3} fw={700}>
            S.Y. {detail.start_year}–{detail.end_year}
          </Title>
          <Badge
            color={detail.is_active ? "#4EAE4A" : "gray"}
            variant="light"
            size="md"
          >
            {detail.is_active ? "Active" : "Closed"}
          </Badge>
        </Group>

        {!detail.hasExams && (
          <Button
            color="red"
            variant="outline"
            size="sm"
            leftSection={<IconTrash size={15} />}
            onClick={() => setDeleteOpened(true)}
          >
            Delete School Year
          </Button>
        )}
      </Group>

      <Stack gap="lg">
        {/* About */}
        <Paper withBorder p="lg" radius="md">
          <Text fw={700} size="lg" mb="md" c="#298925">
            About
          </Text>
          <Stack gap="lg">
            <Group wrap="wrap" style={{ columnGap: 72, rowGap: 8 }}>
              <Box>
                <Text size="sm" fw={700} c="gray.7" mb={2}>
                  Academic Period
                </Text>
                <Text size="sm">
                  S.Y. {detail.start_year}–{detail.end_year}
                </Text>
              </Box>
              <Box>
                <Text size="sm" fw={700} c="gray.7" mb={2}>
                  No. of {numQuarters === 4 ? "Quarters" : "Terms"}
                </Text>
                <Text size="sm">
                  {numQuarters}{" "}
                  {numQuarters === 4
                    ? "Quarters (Q1–Q4)"
                    : numQuarters === 3
                      ? "Terms (T1–T3)"
                      : "Terms (T1–T2)"}
                </Text>
              </Box>
            </Group>
            <Box>
              <Text size="sm" fw={700} c="gray.7" mb={2}>
                Curriculum
              </Text>
              <Group gap={4} align="center">
                <Text size="sm">{detail.curriculum_name}</Text>
                <Tooltip label="Go to curriculum" withArrow>
                  <ActionIcon
                    component={Link}
                    href={`/school/curriculum/${detail.curriculum_id}`}
                    variant="subtle"
                    color="gray"
                    size="xs"
                  >
                    <IconExternalLink size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Box>
          </Stack>
        </Paper>

        {/* Quarters / Terms */}
        <Paper withBorder p="lg" radius="md">
          <Text fw={700} size="lg" mb="md" c="#298925">
            {termLabel}
          </Text>
          <Stack gap="xs">
            {quarters.map((q) => (
              <Group key={q.quarter_id} align="center">
                <Switch
                  checked={q.is_active}
                  onChange={() => void handleQuarterToggle(q.quarter_id)}
                  disabled={togglingId !== null}
                  color="#4EAE4A"
                />
                <Text size="sm" fw={q.is_active ? 600 : 400}>
                  {q.name}
                </Text>
                {q.is_active && (
                  <Badge color="#4EAE4A" variant="light" size="sm">
                    Active
                  </Badge>
                )}
              </Group>
            ))}
          </Stack>
        </Paper>

        {/* Subject Coordinators */}
        <Paper withBorder p="lg" radius="md">
          <Group justify="space-between" align="center" mb="md">
            <Text fw={700} size="lg" c="#298925">
              Subject Coordinators
            </Text>
            {detail.is_active && (
              <Tooltip label="View in Faculty module" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={() =>
                    router.push("/school/faculty?highlight=coordinators")
                  }
                >
                  <IconExternalLink size={16} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>

          {detail.coordinators.length === 0 ? (
            <Text size="sm" c="dimmed" fs="italic">
              No subject coordinators assigned.
            </Text>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden sm:block">
                <TableScrollContainer minWidth={400}>
                  <Table
                    withColumnBorders
                    withTableBorder
                    fz="0.9375rem"
                    style={
                      { "--table-border-color": "#ced4da" } as CSSProperties
                    }
                  >
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th style={reviewTh}>Subject Group</Table.Th>
                        <Table.Th style={reviewTh}>Members</Table.Th>
                        <Table.Th style={reviewTh}>
                          Subject Coordinator
                        </Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {detail.coordinators.map((sc) => {
                        const visible = sc.members.slice(
                          0,
                          MAX_VISIBLE_MEMBERS,
                        );
                        const overflow = sc.members.slice(MAX_VISIBLE_MEMBERS);
                        return (
                          <Table.Tr key={sc.sc_id}>
                            <Table.Td>
                              <Text size="sm" fw={500}>
                                {sc.subject_group_name}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              {sc.members.length === 0 ? (
                                <Text size="sm" c="dimmed">
                                  —
                                </Text>
                              ) : (
                                <Group gap={6} wrap="nowrap">
                                  {visible.map((m) => (
                                    <SubjectBadge
                                      key={m.curriculum_subject_id}
                                      code={m.code}
                                      subject_type="BOTH"
                                      subjectName={m.name}
                                      palette="coordinator"
                                    />
                                  ))}
                                  {overflow.length > 0 && (
                                    <SubjectOverflowCard
                                      subjects={overflow.map((m) => ({
                                        ...m,
                                        subject_type: "BOTH" as const,
                                      }))}
                                    />
                                  )}
                                </Group>
                              )}
                            </Table.Td>
                            <Table.Td>
                              {sc.coordinator_name ? (
                                <Text size="sm">{sc.coordinator_name}</Text>
                              ) : (
                                <Text size="sm" c="dimmed" fs="italic">
                                  Not assigned
                                </Text>
                              )}
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </TableScrollContainer>
              </div>

              {/* Mobile */}
              <div className="sm:hidden">
                {detail.coordinators.map((sc) => (
                  <CoordinatorMobileRow
                    key={sc.sc_id}
                    name={sc.subject_group_name}
                    members={sc.members}
                    coordinatorName={sc.coordinator_name}
                  />
                ))}
              </div>
            </>
          )}
        </Paper>

        {/* Classes, Advisory, and Faculty Assignments */}
        <Paper withBorder p="lg" radius="md">
          <Group justify="space-between" align="center" mb="md" wrap="nowrap">
            <Text fw={700} size="lg" c="#298925" style={{ flex: 1, minWidth: 0 }}>
              Classes, Advisory, and Faculty Assignments
            </Text>
            {detail.is_active && (
              <Tooltip label="View teaching load masterlist" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  component={Link}
                  href="/school/faculty/masterlist"
                >
                  <IconExternalLink size={16} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>

          {detail.grade_levels.length === 0 ? (
            <Text size="sm" c="dimmed" fs="italic">
              No classes defined for this school year.
            </Text>
          ) : (
            <Stack gap="sm">
              {detail.grade_levels.map((gl) => (
                <GradeLevelCollapsible
                  key={gl.grade_level_id}
                  title={gl.display_name}
                >
                  {/* Desktop */}
                  <div className="hidden sm:block">
                    <TableScrollContainer minWidth={500}>
                      <Table
                        withColumnBorders
                        withTableBorder
                        fz="0.9375rem"
                        style={
                          { "--table-border-color": "#ced4da" } as CSSProperties
                        }
                      >
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th style={{ ...reviewTh, minWidth: 175 }}>
                              Class
                            </Table.Th>
                            <Table.Th
                              style={{
                                ...reviewTh,
                                minWidth: 140,
                                fontWeight: 400,
                              }}
                            >
                              Adviser
                            </Table.Th>
                            {gl.subjects.map((sub) => (
                              <Table.Th
                                key={sub.curriculum_subject_id}
                                style={{
                                  ...reviewTh,
                                  minWidth: 120,
                                  fontWeight: 400,
                                }}
                              >
                                <Group gap={4} wrap="nowrap" align="center">
                                  {sub.code}
                                  <Tooltip label={sub.name} withArrow>
                                    <IconInfoCircle
                                      size={14}
                                      style={{ flexShrink: 0, opacity: 0.85 }}
                                    />
                                  </Tooltip>
                                </Group>
                              </Table.Th>
                            ))}
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {gl.sections.map((section) => (
                            <Table.Tr key={section.section_id}>
                              <Table.Td style={{ whiteSpace: "nowrap" }}>
                                <Group gap={6} wrap="nowrap">
                                  <Text size="sm">{section.name}</Text>
                                  <Badge
                                    color={
                                      section.section_type === "SSES"
                                        ? "#70A2FF"
                                        : "#B3B4B4"
                                    }
                                    variant="filled"
                                    size="xs"
                                  >
                                    {section.section_type === "SSES"
                                      ? "SSES"
                                      : "Regular"}
                                  </Badge>
                                </Group>
                              </Table.Td>
                              <Table.Td>
                                {section.adviser_name ? (
                                  <Text size="sm">{section.adviser_name}</Text>
                                ) : (
                                  <Text size="sm" c="dimmed" fs="italic">
                                    —
                                  </Text>
                                )}
                              </Table.Td>
                              {gl.subjects.map((sub) => {
                                const applicable =
                                  sub.subject_type === "BOTH" ||
                                  section.section_type === "SSES";
                                if (!applicable) {
                                  return (
                                    <Table.Td
                                      key={sub.curriculum_subject_id}
                                      style={{ backgroundColor: "#f5f5f5" }}
                                    >
                                      <Text size="xs" c="dimmed" ta="center">
                                        —
                                      </Text>
                                    </Table.Td>
                                  );
                                }
                                const assignment = section.assignments.find(
                                  (a) =>
                                    a.curriculum_subject_id ===
                                    sub.curriculum_subject_id,
                                );
                                return (
                                  <Table.Td key={sub.curriculum_subject_id}>
                                    {assignment?.teacher_name ? (
                                      <Text size="sm">
                                        {assignment.teacher_name}
                                      </Text>
                                    ) : (
                                      <Text size="sm" c="dimmed" fs="italic">
                                        —
                                      </Text>
                                    )}
                                  </Table.Td>
                                );
                              })}
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </TableScrollContainer>
                  </div>

                  {/* Mobile */}
                  <div className="sm:hidden">
                    {gl.sections.map((section) => (
                      <SectionMobileRow
                        key={section.section_id}
                        name={section.name}
                        sectionType={section.section_type}
                        adviserName={section.adviser_name}
                        subjects={gl.subjects
                          .filter(
                            (sub) =>
                              sub.subject_type === "BOTH" ||
                              section.section_type === "SSES",
                          )
                          .map((sub) => ({
                            code: sub.code,
                            name: sub.name,
                            teacherName:
                              section.assignments.find(
                                (a) =>
                                  a.curriculum_subject_id ===
                                  sub.curriculum_subject_id,
                              )?.teacher_name ?? null,
                          }))}
                      />
                    ))}
                  </div>
                </GradeLevelCollapsible>
              ))}
            </Stack>
          )}
        </Paper>
      </Stack>

      {/* Delete modal */}
      <Modal
        opened={deleteOpened}
        onClose={handleCloseDelete}
        title="Delete School Year"
        centered
      >
        <Text size="sm" mb="md">
          Are you sure you want to permanently delete{" "}
          <strong>{detail.year_range}</strong>? All associated data (quarters,
          classes, assignments, enrollments) will be permanently removed. This
          action cannot be undone.
        </Text>
        <Text size="sm" mb="md" c="dimmed">
          Type{" "}
          <Text span fw={700} c="var(--mantine-color-text)">
            delete
          </Text>{" "}
          to confirm.
        </Text>
        <TextInput
          placeholder="Type delete to confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.currentTarget.value)}
          mb="lg"
          disabled={deleting}
        />
        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={handleCloseDelete}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            color="red"
            disabled={confirmText.toLowerCase() !== "delete"}
            loading={deleting}
            onClick={() => void handleDelete()}
          >
            Delete
          </Button>
        </Group>
      </Modal>
    </>
  );
}

// ── Grade level collapsible ────────────────────────────────────────────────────

function GradeLevelCollapsible({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
      <UnstyledButton
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", padding: "12px 16px" }}
      >
        <Group justify="space-between">
          <Text fw={700} size="sm">
            {title}
          </Text>
          {open ? (
            <IconChevronUp size={16} color="#808898" />
          ) : (
            <IconChevronDown size={16} color="#808898" />
          )}
        </Group>
      </UnstyledButton>
      <Collapse in={open}>
        <div style={{ borderTop: "1px solid #ced4da", padding: "16px 20px" }}>
          {children}
        </div>
      </Collapse>
    </Paper>
  );
}

// ── Coordinator mobile row ────────────────────────────────────────────────────

function CoordinatorMobileRow({
  name,
  members,
  coordinatorName,
}: {
  name: string;
  members: { curriculum_subject_id: number; code: string; name: string }[];
  coordinatorName: string | null;
}) {
  const [opened, setOpened] = useState(false);
  const visible = members.slice(0, MAX_VISIBLE_MEMBERS);
  const overflow = members.slice(MAX_VISIBLE_MEMBERS);
  return (
    <>
      <div
        onClick={() => setOpened((v) => !v)}
        style={{ cursor: "pointer", padding: "12px 4px" }}
      >
        <Group gap="xs" wrap="nowrap">
          <IconChevronRight
            size={16}
            style={{
              transform: opened ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 200ms ease",
              flexShrink: 0,
              color: "#808898",
            }}
          />
          <Text
            fw={500}
            fz="sm"
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
          >
            {name}
          </Text>
        </Group>
      </div>
      <Collapse in={opened}>
        <Box pb="md" pl={28} pr={4}>
          <Text size="xs" fw={600} c="#808898" mb={6}>
            Members
          </Text>
          {members.length === 0 ? (
            <Text fz="sm" c="dimmed" fs="italic" mb="sm">
              None
            </Text>
          ) : (
            <Group gap={6} wrap="wrap" mb="sm">
              {visible.map((m) => (
                <SubjectBadge
                  key={m.curriculum_subject_id}
                  code={m.code}
                  subject_type="BOTH"
                  subjectName={m.name}
                  palette="coordinator"
                />
              ))}
              {overflow.length > 0 && (
                <SubjectOverflowCard
                  subjects={overflow.map((m) => ({
                    ...m,
                    subject_type: "BOTH" as const,
                  }))}
                />
              )}
            </Group>
          )}
          <Text size="xs" fw={600} c="#808898" mb={2}>
            Subject Coordinator
          </Text>
          <Text
            fz="md"
            c={coordinatorName ? undefined : "dimmed"}
            fs={coordinatorName ? undefined : "italic"}
          >
            {coordinatorName ?? "Not assigned"}
          </Text>
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

// ── Section mobile row ────────────────────────────────────────────────────────

function SectionMobileRow({
  name,
  sectionType,
  adviserName,
  subjects,
}: {
  name: string;
  sectionType: string;
  adviserName: string | null;
  subjects: { code: string; name: string; teacherName: string | null }[];
}) {
  const [opened, setOpened] = useState(false);
  return (
    <>
      <div
        onClick={() => setOpened((v) => !v)}
        style={{ cursor: "pointer", padding: "12px 4px" }}
      >
        <Group gap="xs" wrap="nowrap">
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
              fz="md"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </Text>
            <Badge
              color={sectionType === "SSES" ? "#70A2FF" : "#B3B4B4"}
              variant="filled"
              size="xs"
              style={{ flexShrink: 0 }}
            >
              {sectionType === "SSES" ? "SSES" : "Regular"}
            </Badge>
          </Group>
        </Group>
      </div>
      <Collapse in={opened}>
        <Box pb="md" pl={28} pr={4}>
          <Text size="xs" fw={600} c="#808898" mb={2}>
            Adviser
          </Text>
          <Text
            fz="md"
            mb="sm"
            c={adviserName ? undefined : "dimmed"}
            fs={adviserName ? undefined : "italic"}
          >
            {adviserName ?? "—"}
          </Text>
          {subjects.map((sub) => (
            <div key={sub.code}>
              <Text size="xs" fw={600} c="#808898" mb={2}>
                {sub.code}
              </Text>
              <Text
                fz="md"
                mb="sm"
                c={sub.teacherName ? undefined : "dimmed"}
                fs={sub.teacherName ? undefined : "italic"}
              >
                {sub.teacherName ?? "—"}
              </Text>
            </div>
          ))}
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}
