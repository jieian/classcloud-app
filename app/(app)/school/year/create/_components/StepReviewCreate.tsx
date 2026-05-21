"use client";

import { useMemo, useState } from "react";
import {
  Alert,
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
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconInfoCircle,
} from "@tabler/icons-react";
import type { UseFormReturnType } from "@mantine/form";
import SubjectBadge from "@/app/(app)/school/faculty/_components/SubjectBadge";
import SubjectOverflowCard from "@/app/(app)/school/faculty/_components/SubjectOverflowCard";
import type {
  CoordinatorDraftMap,
  CreateSchoolYearForm,
  FacultyCellKey,
  WizardCurriculumDetail,
  WizardFacultyOption,
  WizardSection,
  WizardSubjectGroup,
} from "../_lib/types";

interface StepReviewCreateProps {
  form: UseFormReturnType<CreateSchoolYearForm>;
  curriculumDetail: WizardCurriculumDetail;
  faculty: WizardFacultyOption[];
  facultyDraft: Map<FacultyCellKey, string | null>;
  coordinatorDraft: CoordinatorDraftMap;
  extraFacultyNames: Map<string, string>;
  extraCoordinatorNames: Map<string, string>;
  submitError: string | null;
}

export default function StepReviewCreate({
  form,
  curriculumDetail,
  faculty,
  facultyDraft,
  coordinatorDraft,
  extraFacultyNames,
  extraCoordinatorNames,
  submitError,
}: StepReviewCreateProps) {
  const startYear = parseInt(form.values.start_year, 10);
  const endYear = startYear + 1;

  const quarterLabel = (() => {
    const n = form.values.num_quarters;
    if (n === 4) return "4 Quarters (Q1–Q4)";
    if (n === 3) return "3 Terms (T1–T3)";
    return "2 Terms (T1–T2)";
  })();

  const facultyNames = useMemo(() => {
    const map = new Map(
      faculty.map((f) => [f.uid, `${f.first_name} ${f.last_name}`]),
    );
    for (const [uid, name] of extraFacultyNames) map.set(uid, name);
    for (const [uid, name] of extraCoordinatorNames) map.set(uid, name);
    return map;
  }, [faculty, extraFacultyNames, extraCoordinatorNames]);

  function getCellValue(key: FacultyCellKey): string | null {
    return facultyDraft.get(key) ?? null;
  }

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

          {/* Academic Period */}
          <Box
            p="lg"
            style={{
              border: "1px solid #B8B8B8",
              borderRadius: "10px",
            }}
          >
            <Text size="lg" fw={700} mb="md" c="#298925">
              Academic Period Information
            </Text>
            <Group
              align="flex-start"
              wrap="wrap"
              style={{ columnGap: 50, rowGap: 8 }}
            >
              <Box w={{ base: "100%", sm: "auto" }}>
                <Text size="sm" fw={700} c="gray.7" mb={2}>
                  Academic Period
                </Text>
                <Text size="sm">
                  {startYear}–{endYear}
                </Text>
              </Box>
              <Box w={{ base: "100%", sm: "auto" }}>
                <Text size="sm" fw={700} c="gray.7" mb={2}>
                  {form.values.num_quarters === 4 ? "Quarters" : "Terms"}
                </Text>
                <Text size="sm">{quarterLabel}</Text>
              </Box>
              <Box w={{ base: "100%", sm: "auto" }}>
                <Text size="sm" fw={700} c="gray.7" mb={2}>
                  Curriculum
                </Text>
                <Text size="sm">{curriculumDetail.name}</Text>
              </Box>
            </Group>
          </Box>

          {/* Subject Coordinators */}
          <Box
            mt="md"
            p="lg"
            style={{
              border: "1px solid #B8B8B8",
              borderRadius: "10px",
            }}
          >
            <Text size="lg" fw={700} mb="md" c="#298925">
              Subject Coordinators
            </Text>
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
                      <Table.Th style={{ ...reviewTh }}>Subject Group</Table.Th>
                      <Table.Th style={{ ...reviewTh }}>Members</Table.Th>
                      <Table.Th style={{ ...reviewTh }}>
                        Subject Coordinator
                      </Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {curriculumDetail.subject_groups.map((sg) => {
                      const uid =
                        coordinatorDraft.get(sg.subject_group_id) ?? null;
                      const visible = sg.members.slice(0, MAX_VISIBLE_MEMBERS);
                      const overflow = sg.members.slice(MAX_VISIBLE_MEMBERS);
                      return (
                        <Table.Tr key={sg.subject_group_id}>
                          <Table.Td>
                            <Text size="sm" fw={500}>
                              {sg.name}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            {sg.members.length === 0 ? (
                              <Text size="sm" c="dimmed">
                                —
                              </Text>
                            ) : (
                              <Group gap={6} wrap="nowrap">
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
                          </Table.Td>
                          <Table.Td>
                            {uid ? (
                              <Text size="sm">
                                {facultyNames.get(uid) ?? "—"}
                              </Text>
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
              {curriculumDetail.subject_groups.map((sg) => {
                const uid = coordinatorDraft.get(sg.subject_group_id) ?? null;
                return (
                  <CoordinatorMobileReviewRow
                    key={sg.subject_group_id}
                    name={sg.name}
                    members={sg.members}
                    coordinatorName={
                      uid ? (facultyNames.get(uid) ?? null) : null
                    }
                  />
                );
              })}
            </div>
          </Box>

          {/* Classes, Advisory, and Faculty Assignments */}
          <Box
            mt="md"
            p="lg"
            style={{
              border: "1px solid #B8B8B8",
              borderRadius: "10px",
            }}
          >
            <Text size="lg" fw={700} mb="md" c="#298925">
              Classes, Advisory, and Faculty Assignments
            </Text>
            <Stack gap="sm">
              {curriculumDetail.grade_levels.map((gl) => {
                const glSections = form.values.sections.filter(
                  (s) => s.grade_level_id === gl.grade_level_id,
                );
                if (glSections.length === 0) return null;
                return (
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
                            {
                              "--table-border-color": "#ced4da",
                            } as React.CSSProperties
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
                            {glSections.map((section) => (
                              <Table.Tr key={section.tempId}>
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
                                  {(() => {
                                    const name = facultyNames.get(
                                      getCellValue(
                                        `adviser:${section.tempId}`,
                                      ) ?? "",
                                    );
                                    return name ? (
                                      <Text size="sm">{name}</Text>
                                    ) : (
                                      <Text size="sm" c="dimmed" fs="italic">
                                        —
                                      </Text>
                                    );
                                  })()}
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
                                  const name = facultyNames.get(
                                    getCellValue(
                                      `subject:${section.tempId}:${sub.curriculum_subject_id}`,
                                    ) ?? "",
                                  );
                                  return (
                                    <Table.Td key={sub.curriculum_subject_id}>
                                      {name ? (
                                        <Text size="sm">{name}</Text>
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
                      {glSections.map((section) => (
                        <SectionMobileReviewRow
                          key={section.tempId}
                          section={section}
                          adviserName={
                            facultyNames.get(
                              getCellValue(`adviser:${section.tempId}`) ?? "",
                            ) ?? null
                          }
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
                                facultyNames.get(
                                  getCellValue(
                                    `subject:${section.tempId}:${sub.curriculum_subject_id}`,
                                  ) ?? "",
                                ) ?? null,
                            }))}
                        />
                      ))}
                    </div>
                  </GradeLevelCollapsible>
                );
              })}
            </Stack>
          </Box>
        </Box>
      </Group>

      {submitError && (
        <Alert
          variant="filled"
          radius="md"
          mt="lg"
          styles={{
            root: { backgroundColor: "#FF6666" },
            icon: { alignSelf: "center", marginTop: 0 },
          }}
          icon={
            <ThemeIcon color="white" variant="transparent" size="md">
              <IconAlertTriangle size={20} />
            </ThemeIcon>
          }
        >
          <Text fw={700} size="sm">
            Creation Failed
          </Text>
          <Text size="sm">{submitError}</Text>
        </Alert>
      )}
    </Box>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_VISIBLE_MEMBERS = 3;

// ── Styles ─────────────────────────────────────────────────────────────────────

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

// ── Coordinator mobile review row ─────────────────────────────────────────────

function CoordinatorMobileReviewRow({
  name,
  members,
  coordinatorName,
}: {
  name: string;
  members: WizardSubjectGroup["members"];
  coordinatorName: string | null;
}) {
  const [opened, { toggle }] = useDisclosure(false);
  const visible = members.slice(0, MAX_VISIBLE_MEMBERS);
  const overflow = members.slice(MAX_VISIBLE_MEMBERS);
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

// ── Section mobile review row ──────────────────────────────────────────────────

function SectionMobileReviewRow({
  section,
  adviserName,
  subjects,
}: {
  section: WizardSection;
  adviserName: string | null;
  subjects: { code: string; name: string; teacherName: string | null }[];
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
              fz="md"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {section.name}
            </Text>
            <Badge
              color={section.section_type === "SSES" ? "#70A2FF" : "#B3B4B4"}
              variant="filled"
              size="xs"
              style={{ flexShrink: 0 }}
            >
              {section.section_type === "SSES" ? "SSES" : "Regular"}
            </Badge>
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
              <Text
                size="xs"
                c="dimmed"
                fw={600}
                tt="uppercase"
                mb={2}
                style={{ letterSpacing: "0.04em" }}
              >
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
