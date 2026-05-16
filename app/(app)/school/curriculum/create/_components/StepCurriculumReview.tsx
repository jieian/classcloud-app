"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Collapse,
  Divider,
  Group,
  Paper,
  Stack,
  Table,
  TableScrollContainer,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
} from "@tabler/icons-react";
import type { UseFormReturnType } from "@mantine/form";
import type {
  CreateCurriculumForm,
  GradeLevel,
  WizardSubject,
} from "../_lib/types";

const greenTh: React.CSSProperties = {
  backgroundColor: "#4EAE4A",
  color: "#fff",
  fontWeight: 600,
  padding: "8px 12px",
  textAlign: "left",
  fontSize: 13,
};

const SUBJECTS_DEFAULT_SHOW = 3;

function SubjectCodeBadge({
  code,
  name,
  subject_type,
}: {
  code: string;
  name: string;
  subject_type: "BOTH" | "SSES";
}) {
  return (
    <Tooltip label={name} withArrow position="top" maw={220}>
      <Badge
        variant="filled"
        radius="xl"
        style={{
          cursor: "default",
          backgroundColor: subject_type === "SSES" ? "#70A2FF" : "#B3B4B4",
          color: "#FFFFFF",
          minWidth: 48,
          justifyContent: "center",
        }}
      >
        {code}
      </Badge>
    </Tooltip>
  );
}

function SubjectMobileRow({ subject }: { subject: WizardSubject }) {
  const [opened, { toggle }] = useDisclosure(false);
  return (
    <>
      <div style={{ padding: "10px 4px" }}>
        <UnstyledButton onClick={toggle} style={{ width: "100%" }}>
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
            <Text fw={500} fz="sm" ff="monospace" style={{ flexShrink: 0 }}>
              {subject.code}
            </Text>
            {subject.subject_type === "SSES" && (
              <Badge
                color="blue"
                variant="filled"
                size="xs"
                radius="xl"
                style={{ cursor: "default" }}
              >
                SSES
              </Badge>
            )}
            <Text
              fz="sm"
              c="dimmed"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {subject.name}
            </Text>
          </Group>
        </UnstyledButton>
      </div>
      <Collapse in={opened}>
        <Box pb="md" pl={28} pr={4}>
          {subject.description && (
            <>
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
              <Text fz="sm" c="dimmed" mb="sm">
                {subject.description}
              </Text>
            </>
          )}
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

function GroupMobileRow({
  name,
  description,
  memberTempIds,
  subjectByTempId,
}: {
  name: string;
  description: string;
  memberTempIds: string[];
  subjectByTempId: Map<string, WizardSubject>;
}) {
  const [opened, { toggle }] = useDisclosure(false);
  return (
    <>
      <div style={{ padding: "10px 4px" }}>
        <UnstyledButton onClick={toggle} style={{ width: "100%" }}>
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
              }}
            >
              {name}
            </Text>
          </Group>
        </UnstyledButton>
      </div>
      <Collapse in={opened}>
        <Box pb="md" pl={28} pr={4}>
          {description && (
            <>
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
              <Text fz="sm" c="dimmed" mb="sm">
                {description}
              </Text>
            </>
          )}
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
          {memberTempIds.length === 0 ? (
            <Text fz="sm" c="dimmed" fs="italic">
              None
            </Text>
          ) : (
            <Group gap={6} wrap="wrap">
              {memberTempIds.map((tid) => {
                const s = subjectByTempId.get(tid);
                return s ? (
                  <SubjectCodeBadge
                    key={tid}
                    code={s.code}
                    name={s.name}
                    subject_type={s.subject_type}
                  />
                ) : null;
              })}
            </Group>
          )}
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

function GradeLevelTable({ subjects }: { subjects: WizardSubject[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded
    ? subjects
    : subjects.slice(0, SUBJECTS_DEFAULT_SHOW);
  const hasMore = subjects.length > SUBJECTS_DEFAULT_SHOW;

  return (
    <>
      {/* Desktop */}
      <div className="hidden sm:block">
        <TableScrollContainer minWidth={400}>
          <Table
            withColumnBorders
            withTableBorder
            fz="sm"
            style={{ "--table-border-color": "#ced4da" } as React.CSSProperties}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ ...greenTh, width: 130 }}>
                  Subject Code
                </Table.Th>
                <Table.Th style={{ ...greenTh, width: 210 }}>Title</Table.Th>
                <Table.Th style={greenTh}>Description</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visible.map((s) => (
                <Table.Tr key={s.tempId}>
                  <Table.Td>
                    <Group gap={4}>
                      <Text size="sm" fw={500} ff="monospace">
                        {s.code}
                      </Text>
                      {s.subject_type === "SSES" && (
                        <Badge color="blue" variant="light" size="xs">
                          SSES
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{s.name}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {s.description ?? ""}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </TableScrollContainer>
        {hasMore && (
          <Group justify="center" mt="xs">
            <UnstyledButton onClick={() => setExpanded((v) => !v)}>
              <Text size="sm" c="dimmed">
                {expanded ? "See Less" : "See More"}
              </Text>
            </UnstyledButton>
          </Group>
        )}
      </div>

      {/* Mobile */}
      <div className="sm:hidden">
        {visible.map((s) => (
          <SubjectMobileRow key={s.tempId} subject={s} />
        ))}
        {hasMore && (
          <Group justify="center" mt="xs">
            <UnstyledButton onClick={() => setExpanded((v) => !v)}>
              <Text size="sm" c="dimmed">
                {expanded ? "See Less" : "See More"}
              </Text>
            </UnstyledButton>
          </Group>
        )}
      </div>
    </>
  );
}

function CollapsibleGradeLevel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Paper
      withBorder
      radius="md"
      style={{ overflow: "hidden", marginBottom: 6 }}
    >
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

interface Props {
  form: UseFormReturnType<CreateCurriculumForm>;
  gradeLevels: GradeLevel[];
}

export default function StepCurriculumReview({ form, gradeLevels }: Props) {
  const gradeLevelNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const gl of gradeLevels) map.set(gl.grade_level_id, gl.display_name);
    return map;
  }, [gradeLevels]);
  const [showGroups, setShowGroups] = useState(false);

  const { name, description, subjects, subject_groups } = form.values;

  const subjectsByGl = useMemo(() => {
    const map = new Map<number, WizardSubject[]>();
    for (const s of subjects) {
      const arr = map.get(s.grade_level_id) ?? [];
      arr.push(s);
      map.set(s.grade_level_id, arr);
    }
    return map;
  }, [subjects]);

  const sortedGlIds = useMemo(
    () =>
      gradeLevels
        .filter((gl) => subjectsByGl.has(gl.grade_level_id))
        .map((gl) => gl.grade_level_id),
    [gradeLevels, subjectsByGl],
  );

  const subjectByTempId = useMemo(() => {
    const map = new Map<string, WizardSubject>();
    for (const s of subjects) map.set(s.tempId, s);
    return map;
  }, [subjects]);

  return (
    <Box>
      <Text size="xl" fw={700} mb="md" c="#298925">
        Review and Create
      </Text>

      <Group gap="lg" align="flex-start" wrap="wrap">
        <Box
          p="lg"
          w="100%"
          style={{
            border: "1px solid #B8B8B8",
            borderRadius: "8px",
            minWidth: 0,
          }}
        >
          <Text size="sm" c="gray.7" mb="md">
            Please ensure all information is correct. You can still return to
            previous steps to edit.
          </Text>

          {/* Curriculum Name and Description */}
          <Box
            p="lg"
            style={{
              border: "1px solid #B8B8B8",
              borderRadius: "10px",
            }}
          >
            <Text size="lg" fw={700} mb="md" c="#298925">
              Curriculum Name and Description
            </Text>

            <Stack gap="xs">
              <div>
                <Text size="sm" fw={700} c="gray.7" mb={2}>
                  Name
                </Text>
                <Text size="sm">{name}</Text>
              </div>
              <div>
                <Text size="sm" fw={700} c="gray.7" mb={2}>
                  Description
                </Text>
                <Text size="sm" c="dimmed">
                  {description}
                </Text>
              </div>
            </Stack>
          </Box>

          {/* Subjects / Groups toggle card */}
          <Box
            mt="md"
            p="lg"
            style={{
              border: "1px solid #B8B8B8",
              borderRadius: "10px",
            }}
          >
            <Group justify="space-between" mb="md" align="center">
              <Text size="lg" fw={700} c="#298925">
                {showGroups ? "Subject Groups" : "Subjects per Grade Level"}
              </Text>
              <Button
                variant="outline"
                color="#5f646e"
                size="xs"
                onClick={() => setShowGroups((v) => !v)}
              >
                {showGroups ? "← Subjects per Grade Level" : "Subject Groups →"}
              </Button>
            </Group>

            {/* Subjects per grade level */}
            {!showGroups && (
              <Stack gap={0}>
                {sortedGlIds.map((glId) => (
                  <CollapsibleGradeLevel
                    key={glId}
                    title={gradeLevelNames.get(glId) ?? `Grade Level ${glId}`}
                  >
                    <GradeLevelTable subjects={subjectsByGl.get(glId) ?? []} />
                  </CollapsibleGradeLevel>
                ))}
              </Stack>
            )}

            {/* Subject groups */}
            {showGroups && (
              <>
                {/* Desktop */}
                <div className="hidden sm:block">
                  <Box
                    style={{
                      border: "1px solid #dee2e6",
                      borderRadius: 6,
                      overflow: "hidden",
                    }}
                  >
                    <table
                      style={{ width: "100%", borderCollapse: "collapse" }}
                    >
                      <thead>
                        <tr>
                          <th style={{ ...greenTh, width: 200 }}>
                            Subject Group Name
                          </th>
                          <th style={{ ...greenTh, width: 260 }}>
                            Description
                          </th>
                          <th style={greenTh}>Members</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subject_groups.map((g) => (
                          <tr
                            key={g.tempId}
                            style={{ borderTop: "1px solid #dee2e6" }}
                          >
                            <td style={{ padding: "8px 12px" }}>
                              <Text size="sm" fw={500}>
                                {g.name}
                              </Text>
                            </td>
                            <td style={{ padding: "8px 12px" }}>
                              <Text size="sm" c="dimmed">
                                {g.description}
                              </Text>
                            </td>
                            <td style={{ padding: "8px 12px" }}>
                              <Group gap={5} wrap="wrap">
                                {g.memberTempIds.map((tid) => {
                                  const s = subjectByTempId.get(tid);
                                  return s ? (
                                    <SubjectCodeBadge
                                      key={tid}
                                      code={s.code}
                                      name={s.name}
                                      subject_type={s.subject_type}
                                    />
                                  ) : null;
                                })}
                              </Group>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Box>
                </div>

                {/* Mobile */}
                <div className="sm:hidden">
                  {subject_groups.map((g) => (
                    <GroupMobileRow
                      key={g.tempId}
                      name={g.name}
                      description={g.description}
                      memberTempIds={g.memberTempIds}
                      subjectByTempId={subjectByTempId}
                    />
                  ))}
                </div>
              </>
            )}
          </Box>
        </Box>
      </Group>
    </Box>
  );
}
