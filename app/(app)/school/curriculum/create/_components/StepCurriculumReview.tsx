"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Collapse,
  Group,
  Stack,
  Table,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import type { UseFormReturnType } from "@mantine/form";
import type { CreateCurriculumForm, GradeLevel, WizardSubject } from "../_lib/types";

const greenTh: React.CSSProperties = {
  backgroundColor: "#4EAE4A",
  color: "#fff",
  fontWeight: 600,
  padding: "8px 12px",
  textAlign: "left",
  fontSize: 13,
};

const SUBJECTS_DEFAULT_SHOW = 3;

function GradeLevelTable({ subjects }: { subjects: WizardSubject[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? subjects : subjects.slice(0, SUBJECTS_DEFAULT_SHOW);
  const hasMore = subjects.length > SUBJECTS_DEFAULT_SHOW;

  return (
    <>
      <Table
        withColumnBorders
        withTableBorder
        fz="sm"
        style={{ "--table-border-color": "#ced4da" } as React.CSSProperties}
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ ...greenTh, width: 130 }}>Subject Code</Table.Th>
            <Table.Th style={{ ...greenTh, width: 210 }}>Title</Table.Th>
            <Table.Th style={greenTh}>Description</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {visible.map((s) => (
            <Table.Tr key={s.tempId}>
              <Table.Td>
                <Group gap={4}>
                  <Text size="sm" fw={500} ff="monospace">{s.code}</Text>
                  {s.subject_type === "SSES" && <Badge color="blue" variant="light" size="xs">SSES</Badge>}
                </Group>
              </Table.Td>
              <Table.Td><Text size="sm">{s.name}</Text></Table.Td>
              <Table.Td><Text size="sm" c="dimmed">{s.description ?? ""}</Text></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {hasMore && (
        <Group justify="center" mt="xs">
          <UnstyledButton onClick={() => setExpanded((v) => !v)}>
            <Text size="sm" c="dimmed">{expanded ? "See Less" : "See More"}</Text>
          </UnstyledButton>
        </Group>
      )}
    </>
  );
}

function CollapsibleGradeLevel({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <Box style={{ border: "1px solid #dee2e6", borderRadius: 5, overflow: "hidden", marginBottom: 6 }}>
      <UnstyledButton
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", padding: "10px 14px", backgroundColor: "#fff" }}
      >
        <Group justify="space-between">
          <Text fw={600} size="sm">{title}</Text>
          {open ? <IconChevronUp size={13} color="#808898" /> : <IconChevronDown size={13} color="#808898" />}
        </Group>
      </UnstyledButton>
      <Collapse in={open}>{children}</Collapse>
    </Box>
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

  // Use the level_number order from gradeLevels array, filtered to only those that have subjects
  const sortedGlIds = useMemo(
    () => gradeLevels.filter((gl) => subjectsByGl.has(gl.grade_level_id)).map((gl) => gl.grade_level_id),
    [gradeLevels, subjectsByGl]
  );

  const subjectByTempId = useMemo(() => {
    const map = new Map<string, WizardSubject>();
    for (const s of subjects) map.set(s.tempId, s);
    return map;
  }, [subjects]);

  return (
    <Box>
      <Text size="lg" fw={700} mb="md" c="#4EAE4A">
        Review and Create
      </Text>

      {/* Name and Description card */}
      <Box mb="md" p="lg" style={{ border: "1px solid #e0e0e0", borderRadius: 8 }}>
        <Text size="md" fw={700} mb="md" c="#4EAE4A">Name and Description</Text>
        <Stack gap="xs">
          <div>
            <Text size="sm" fw={600}>Name</Text>
            <Text size="sm">{name}</Text>
          </div>
          <div>
            <Text size="sm" fw={600}>Description</Text>
            <Text size="sm" c="dimmed">{description}</Text>
          </div>
        </Stack>
      </Box>

      {/* Subjects / Groups toggle card */}
      <Box p="lg" style={{ border: "1px solid #e0e0e0", borderRadius: 8 }}>
        <Group justify="space-between" mb="md" align="center">
          <Text size="md" fw={700} c="#4EAE4A">
            {showGroups ? "Subject Groups" : "Subjects per Grade Level"}
          </Text>
          <Button
            variant="outline"
            color="#808898"
            size="xs"
            onClick={() => setShowGroups((v) => !v)}
          >
            {showGroups ? "← Subjects per Grade Level" : "Subject Groups →"}
          </Button>
        </Group>

        {/* Subjects per grade level */}
        {!showGroups && (
          <>
            {sortedGlIds.map((glId) => (
              <CollapsibleGradeLevel
                key={glId}
                title={gradeLevelNames.get(glId) ?? `Grade Level ${glId}`}
              >
                <div style={{ borderTop: "1px solid #ced4da", padding: "16px 20px" }}>
                  <GradeLevelTable subjects={subjectsByGl.get(glId) ?? []} />
                </div>
              </CollapsibleGradeLevel>
            ))}
          </>
        )}

        {/* Subject groups */}
        {showGroups && (
          <Box style={{ border: "1px solid #dee2e6", borderRadius: 6, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...greenTh, width: 200 }}>Subject Group Name</th>
                  <th style={{ ...greenTh, width: 260 }}>Description</th>
                  <th style={greenTh}>Members</th>
                </tr>
              </thead>
              <tbody>
                {subject_groups.map((g) => (
                  <tr key={g.tempId} style={{ borderTop: "1px solid #dee2e6" }}>
                    <td style={{ padding: "8px 12px" }}><Text size="sm" fw={500}>{g.name}</Text></td>
                    <td style={{ padding: "8px 12px" }}><Text size="sm" c="dimmed">{g.description}</Text></td>
                    <td style={{ padding: "8px 12px" }}>
                      <Group gap={5} wrap="wrap">
                        {g.memberTempIds.map((tid) => {
                          const s = subjectByTempId.get(tid);
                          return s ? (
                            <Tooltip key={tid} label={s.name} withArrow position="top">
                              <Badge color="blue" variant="filled" size="sm" radius="xl" style={{ cursor: "default" }}>{s.code}</Badge>
                            </Tooltip>
                          ) : null;
                        })}
                      </Group>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        )}
      </Box>
    </Box>
  );
}
