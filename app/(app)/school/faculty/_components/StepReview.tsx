"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Collapse,
  Divider,
  Group,
  Paper,
  Stack,
  Table,
  TableScrollContainer,
  Text,
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
  AddFacultyForm,
  GradeLevel,
  SectionWithAdviser,
  SubjectCoordinatorGroup,
  SubjectForGradeLevel,
  WizardGSLGrade,
} from "../_lib/teachingLoadService";
import SubjectBadge from "./SubjectBadge";
import SubjectOverflowCard from "./SubjectOverflowCard";

interface StepReviewProps {
  form: UseFormReturnType<AddFacultyForm>;
  facultyName: string;
  gradeLevels: GradeLevel[];
  sections: SectionWithAdviser[];
  subjectsByGradeLevel: SubjectForGradeLevel[];
  isAddMode: boolean;
  coordinatorGroups: SubjectCoordinatorGroup[];
  gslData: WizardGSLGrade[];
}

const MAX_VISIBLE_SUBJECTS = 3;

const reviewTh: React.CSSProperties = {
  backgroundColor: "#4EAE4A",
  color: "#fff",
  fontWeight: 600,
  padding: "6px 12px",
};

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

// ── Section mobile review row ──────────────────────────────────────────────────

function SectionMobileReviewRow({
  sectionName,
  subjects,
}: {
  sectionName: string;
  subjects: { code: string; name: string; subject_type: "BOTH" | "SSES" }[];
}) {
  const [opened, { toggle }] = useDisclosure(false);
  return (
    <>
      <div onClick={toggle} style={{ cursor: "pointer", padding: "12px 4px" }}>
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
              fz="sm"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {sectionName}
            </Text>
          </Group>
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
            Subjects
          </Text>
          {subjects.length === 0 ? (
            <Text fz="sm" c="dimmed" fs="italic">
              None
            </Text>
          ) : (
            <Stack gap={6}>
              {subjects.map((s) => (
                <Group key={s.code} gap={8} wrap="nowrap" align="flex-start">
                  <Badge
                    variant="filled"
                    radius="xl"
                    size="sm"
                    style={{
                      cursor: "default",
                      backgroundColor: s.subject_type === "SSES" ? "#70A2FF" : "#B3B4B4",
                      color: "#fff",
                      minWidth: 48,
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {s.code}
                  </Badge>
                  <Text fz="sm" style={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>
                    {s.name}
                  </Text>
                </Group>
              ))}
            </Stack>
          )}
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

// ── Coordinator mobile review row ─────────────────────────────────────────────

function CoordinatorMobileRow({
  name,
  description,
  members,
}: {
  name: string;
  description: string | null;
  members: SubjectCoordinatorGroup["members"];
}) {
  const [opened, { toggle }] = useDisclosure(false);
  const visible = members.slice(0, MAX_VISIBLE_SUBJECTS);
  const overflow = members.slice(MAX_VISIBLE_SUBJECTS);
  return (
    <>
      <div onClick={toggle} style={{ cursor: "pointer", padding: "12px 4px" }}>
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
              <Text fz="sm" mb="sm">
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
            Subjects
          </Text>
          {members.length === 0 ? (
            <Text fz="sm" c="dimmed" fs="italic">
              None
            </Text>
          ) : (
            <Group gap={6} wrap="wrap">
              {visible.map((m) => (
                <SubjectBadge
                  key={m.curriculum_subject_id}
                  code={m.code}
                  subject_type={m.subject_type}
                  subjectName={m.name}
                  palette="coordinator"
                />
              ))}
              {overflow.length > 0 && (
                <SubjectOverflowCard subjects={overflow} />
              )}
            </Group>
          )}
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function StepReview({
  form,
  facultyName,
  gradeLevels,
  sections,
  subjectsByGradeLevel,
  isAddMode,
  coordinatorGroups,
  gslData,
}: StepReviewProps) {
  // O(1) lookup maps
  const sectionMap = useMemo(
    () => new Map(sections.map((s) => [s.section_id, s])),
    [sections],
  );
  const gradeLevelMap = useMemo(
    () => new Map(gradeLevels.map((gl) => [gl.grade_level_id, gl])),
    [gradeLevels],
  );
  const subjectMap = useMemo(
    () => new Map(subjectsByGradeLevel.map((s) => [s.subject_id, s])),
    [subjectsByGradeLevel],
  );

  // Advisory class
  const advisorySection =
    form.values.advisory_section_id !== null
      ? (sectionMap.get(form.values.advisory_section_id) ?? null)
      : null;
  const advisoryGradeLevel = advisorySection
    ? (gradeLevelMap.get(advisorySection.grade_level_id) ?? null)
    : null;
  const advisoryLabel =
    advisorySection && advisoryGradeLevel
      ? `${advisoryGradeLevel.display_name} • ${advisorySection.name}`
      : null;

  // Subject assignments grouped by grade level, sorted by GL then section name
  const assignmentsByGl = useMemo(() => {
    const map = new Map<
      number,
      {
        section: SectionWithAdviser;
        subjectNames: { code: string; name: string; subject_type: "BOTH" | "SSES" }[];
      }[]
    >();
    for (const assignment of form.values.subject_assignments) {
      const section = sectionMap.get(assignment.section_id);
      if (!section) continue;
      const glId = section.grade_level_id;
      const subjectNames = assignment.subject_ids
        .map((sid) => subjectMap.get(sid))
        .filter(Boolean)
        .map((s) => ({ code: s!.code, name: s!.name, subject_type: s!.subject_type }))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (!map.has(glId)) map.set(glId, []);
      map.get(glId)!.push({ section, subjectNames });
    }
    // Sort sections within each GL
    for (const rows of map.values()) {
      rows.sort((a, b) => a.section.name.localeCompare(b.section.name));
    }
    return map;
  }, [form.values.subject_assignments, sectionMap, subjectMap]);

  // Selected coordinator group
  const selectedGroup = useMemo(
    () =>
      form.values.subject_group_id !== null
        ? (coordinatorGroups.find(
            (g) => g.subject_group_id === form.values.subject_group_id,
          ) ?? null)
        : null,
    [form.values.subject_group_id, coordinatorGroups],
  );

  // Selected GSL slot
  const selectedGSLSlot = useMemo(() => {
    if (!isAddMode || form.values.gsl_curriculum_subject_id === null) return null;
    return (
      gslData
        .flatMap((g) => g.subjects)
        .find(
          (s) =>
            s.curriculum_subject_id === form.values.gsl_curriculum_subject_id &&
            s.grade_level_id === form.values.gsl_grade_level_id,
        ) ?? null
    );
  }, [isAddMode, form.values.gsl_curriculum_subject_id, form.values.gsl_grade_level_id, gslData]);

  const selectedGSLGrade = useMemo(
    () =>
      selectedGSLSlot
        ? (gslData.find((g) => g.grade_level_id === selectedGSLSlot.grade_level_id) ?? null)
        : null,
    [selectedGSLSlot, gslData],
  );

  return (
    <Box>
      <Text size="xl" fw={700} mb="md" c="#298925">
        {isAddMode ? "Review & Confirm" : "Review & Save"}
      </Text>

      <Box p="lg" style={{ border: "1px solid #B8B8B8", borderRadius: "8px" }}>
        <Text size="sm" c="gray.7" mb="md">
          {isAddMode ? (
            <>
              Review the teaching load and coordinator role for{" "}
              <strong>{facultyName}</strong> before adding them as faculty.
            </>
          ) : (
            <>
              Review the updated teaching load for{" "}
              <strong>{facultyName}</strong> before saving.
            </>
          )}
        </Text>

        {/* Advisory Class */}
        <Box
          p="lg"
          mb="md"
          style={{ border: "1px solid #B8B8B8", borderRadius: "10px" }}
        >
          <Text size="lg" fw={700} mb="md" c="#298925">
            Advisory Class
          </Text>
          <Text size="sm" fw={700} c="gray.7" mb={2}>
            Advisory Class
          </Text>
          {advisoryLabel ? (
            <Text size="sm">{advisoryLabel}</Text>
          ) : (
            <Text size="sm" c="dimmed" fs="italic">
              No advisory class selected.
            </Text>
          )}
        </Box>

        {/* Subject Coordinator — add mode only */}
        {isAddMode && (
          <Box
            p="lg"
            mb="md"
            style={{ border: "1px solid #B8B8B8", borderRadius: "10px" }}
          >
            <Text size="lg" fw={700} mb="md" c="#298925">
              Subject Coordinator
            </Text>

            {selectedGroup === null ? (
              <Text size="sm" c="dimmed" fs="italic">
                No Subject Coordinator Role assigned.
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
                        {
                          "--table-border-color": "#ced4da",
                        } as React.CSSProperties
                      }
                    >
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th style={reviewTh}>Subject Group</Table.Th>
                          <Table.Th style={reviewTh}>Subjects</Table.Th>
                          <Table.Th style={reviewTh}>Description</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        <Table.Tr>
                          <Table.Td>
                            <Text size="sm" fw={500}>
                              {selectedGroup.name}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            {selectedGroup.members.length === 0 ? (
                              <Text size="sm" c="dimmed">
                                —
                              </Text>
                            ) : (
                              <Group gap={6} wrap="nowrap">
                                {selectedGroup.members
                                  .slice(0, MAX_VISIBLE_SUBJECTS)
                                  .map((m) => (
                                    <SubjectBadge
                                      key={m.curriculum_subject_id}
                                      code={m.code}
                                      subject_type={m.subject_type}
                                      subjectName={m.name}
                                      palette="coordinator"
                                    />
                                  ))}
                                {selectedGroup.members.length >
                                  MAX_VISIBLE_SUBJECTS && (
                                  <SubjectOverflowCard
                                    subjects={selectedGroup.members.slice(
                                      MAX_VISIBLE_SUBJECTS,
                                    )}
                                  />
                                )}
                              </Group>
                            )}
                          </Table.Td>
                          <Table.Td>
                            <Text
                              size="sm"
                              c={
                                selectedGroup.description ? undefined : "dimmed"
                              }
                              fs={
                                selectedGroup.description ? undefined : "italic"
                              }
                            >
                              {selectedGroup.description ?? "—"}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      </Table.Tbody>
                    </Table>
                  </TableScrollContainer>
                </div>

                {/* Mobile */}
                <div className="sm:hidden">
                  <CoordinatorMobileRow
                    name={selectedGroup.name}
                    description={selectedGroup.description ?? null}
                    members={selectedGroup.members}
                  />
                </div>
              </>
            )}
          </Box>
        )}

        {/* Grade Subject Leader — add mode only */}
        {isAddMode && (
          <Box
            p="lg"
            mb="md"
            style={{ border: "1px solid #B8B8B8", borderRadius: "10px" }}
          >
            <Text size="lg" fw={700} mb="md" c="#298925">
              Grade Subject Leader
            </Text>

            {selectedGSLSlot === null ? (
              <Text size="sm" c="dimmed" fs="italic">
                No Grade Subject Leader Role assigned.
              </Text>
            ) : (
              <>
                <Text size="sm" fw={700} c="gray.7" mb={2}>
                  Grade Level &amp; Subject
                </Text>
                <Group gap={6} wrap="nowrap" align="center">
                  <Text size="sm">
                    {selectedGSLGrade?.display_name ?? "—"} &bull;{" "}
                    {selectedGSLSlot.subject_name}
                  </Text>
                  {selectedGSLSlot.subject_type === "SSES" && (
                    <Badge
                      size="xs"
                      variant="filled"
                      radius="xl"
                      style={{ backgroundColor: "#70A2FF", color: "#fff" }}
                    >
                      SSES
                    </Badge>
                  )}
                </Group>
              </>
            )}
          </Box>
        )}

        {/* Teaching Load */}
        <Box
          p="lg"
          style={{ border: "1px solid #B8B8B8", borderRadius: "10px" }}
        >
          <Text size="lg" fw={700} mb="md" c="#298925">
            Teaching Load
          </Text>

          {/* Grade level collapsibles */}
          {form.values.selected_sections.length === 0 ? (
            <Text size="sm" c="dimmed" fs="italic">
              No sections assigned.
            </Text>
          ) : (
            <Stack gap="sm">
              {gradeLevels.map((gl) => {
                const rows = assignmentsByGl.get(gl.grade_level_id);
                if (!rows || rows.length === 0) return null;
                return (
                  <GradeLevelCollapsible
                    key={gl.grade_level_id}
                    title={gl.display_name}
                  >
                    {/* Desktop */}
                    <div className="hidden sm:block">
                      <TableScrollContainer minWidth={400}>
                        <Table
                          withColumnBorders
                          withTableBorder
                          fz="0.9375rem"
                          style={
                            {
                              "--table-border-color": "#ced4da",
                            } as React.CSSProperties
                          }
                        >
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th style={{ ...reviewTh, minWidth: 160 }}>
                                Class
                              </Table.Th>
                              <Table.Th style={{ ...reviewTh, minWidth: 260 }}>
                                Subjects
                              </Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {rows.map(({ section, subjectNames }) => (
                              <Table.Tr key={section.section_id}>
                                <Table.Td>
                                  <Text size="sm">{section.name}</Text>
                                </Table.Td>
                                <Table.Td>
                                  {subjectNames.length === 0 ? (
                                    <Text size="sm" c="dimmed" fs="italic">
                                      —
                                    </Text>
                                  ) : (
                                    <Stack gap={6}>
                                      {subjectNames.map((s) => (
                                        <Group key={s.code} gap={8} wrap="nowrap" align="flex-start">
                                          <Badge
                                            variant="filled"
                                            radius="xl"
                                            size="sm"
                                            style={{
                                              cursor: "default",
                                              backgroundColor: s.subject_type === "SSES" ? "#70A2FF" : "#B3B4B4",
                                              color: "#fff",
                                              minWidth: 48,
                                              justifyContent: "center",
                                              flexShrink: 0,
                                              marginTop: 2,
                                            }}
                                          >
                                            {s.code}
                                          </Badge>
                                          <Text size="sm" style={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>
                                            {s.name}
                                          </Text>
                                        </Group>
                                      ))}
                                    </Stack>
                                  )}
                                </Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </TableScrollContainer>
                    </div>

                    {/* Mobile */}
                    <div className="sm:hidden">
                      {rows.map(({ section, subjectNames }) => (
                        <SectionMobileReviewRow
                          key={section.section_id}
                          sectionName={section.name}
                          subjects={subjectNames}
                        />
                      ))}
                    </div>
                  </GradeLevelCollapsible>
                );
              })}
            </Stack>
          )}
        </Box>
      </Box>
    </Box>
  );
}
