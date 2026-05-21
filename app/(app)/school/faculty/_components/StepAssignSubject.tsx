"use client";

import {
  Box,
  Text,
  Checkbox,
  Divider,
  Group,
  Collapse,
  Tooltip,
  UnstyledButton,
  Paper,
} from "@mantine/core";
import { useState, useMemo } from "react";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronDown, IconChevronUp, IconUser } from "@tabler/icons-react";
import type { UseFormReturnType } from "@mantine/form";
import type {
  AddFacultyForm,
  GradeLevel,
  SectionWithAdviser,
  SubjectForGradeLevel,
  TeacherAssignment,
} from "../_lib/teachingLoadService";

interface StepAssignSubjectProps {
  form: UseFormReturnType<AddFacultyForm>;
  gradeLevels: GradeLevel[];
  sections: SectionWithAdviser[];
  subjectsByGradeLevel: SubjectForGradeLevel[];
  allAssignments: TeacherAssignment[];
  facultyUid: string;
}

interface SectionBlockProps {
  label: string;
  selectedCount: number;
  children: React.ReactNode;
}

function SectionBlock({ label, selectedCount, children }: SectionBlockProps) {
  const [opened, setOpened] = useState(true);

  return (
    <Paper withBorder radius="md" mb="xs" style={{ overflow: "hidden" }}>
      <UnstyledButton
        onClick={() => setOpened((o) => !o)}
        style={{ width: "100%", padding: "12px 16px" }}
      >
        <Group justify="space-between">
          <Text fw={700} size="sm">
            {label}{" "}
            <Text span c={selectedCount > 0 ? "#4EAE4A" : "dimmed"} fw={selectedCount > 0 ? 700 : 400}>
              ({selectedCount})
            </Text>
          </Text>
          {opened ? (
            <IconChevronUp size={16} color="#808898" />
          ) : (
            <IconChevronDown size={16} color="#808898" />
          )}
        </Group>
      </UnstyledButton>
      <Collapse in={opened}>
        <div style={{ borderTop: "1px solid #ced4da", padding: "16px 20px" }}>
          {children}
        </div>
      </Collapse>
    </Paper>
  );
}

export default function StepAssignSubject({
  form,
  gradeLevels,
  sections,
  subjectsByGradeLevel,
  allAssignments,
  facultyUid,
}: StepAssignSubjectProps) {
  const subjectAssignments = form.values.subject_assignments;

  const toggleSubject = (sectionId: number, subjectId: number) => {
    const updated = subjectAssignments.map((a) => {
      if (a.section_id !== sectionId) return a;
      const isSelected = a.subject_ids.includes(subjectId);
      return {
        ...a,
        subject_ids: isSelected
          ? a.subject_ids.filter((id) => id !== subjectId)
          : [...a.subject_ids, subjectId],
      };
    });
    form.setFieldValue("subject_assignments", updated);
  };

  // Map: grade_level_id → subjects (built once)
  // Subject visibility: BOTH applies to all sections; SSES applies only to SSES sections
  const subjectsByGl = useMemo(() => {
    const map = new Map<number, SubjectForGradeLevel[]>();
    for (const s of subjectsByGradeLevel) {
      const existing = map.get(s.grade_level_id);
      if (existing) existing.push(s);
      else map.set(s.grade_level_id, [s]);
    }
    return map;
  }, [subjectsByGradeLevel]);

  // Selected sections sorted by grade level then name (independent of click order)
  const sortedSelectedSections = useMemo(() => {
    const sectionMap = new Map(sections.map((s) => [s.section_id, s]));
    const glOrder = new Map(
      gradeLevels.map((gl) => [gl.grade_level_id, gl.level_number]),
    );
    return [...form.values.selected_sections].sort((a, b) => {
      const sa = sectionMap.get(a);
      const sb = sectionMap.get(b);
      const glDiff =
        (glOrder.get(sa?.grade_level_id ?? 0) ?? 0) -
        (glOrder.get(sb?.grade_level_id ?? 0) ?? 0);
      if (glDiff !== 0) return glDiff;
      return (sa?.name ?? "").localeCompare(sb?.name ?? "");
    });
  }, [form.values.selected_sections, sections, gradeLevels]);

  // Map: "sectionId-subjectId" → teacher name for subjects taken by others (O(1) lookup)
  const takenByMap = useMemo(
    () =>
      new Map(
        allAssignments
          .filter((a) => a.teacher_id !== facultyUid)
          .map((a) => [`${a.section_id}-${a.subject_id}`, a.teacher_name]),
      ),
    [allAssignments, facultyUid],
  );

  const takenByOther = (sectionId: number, subjectId: number): string | null =>
    takenByMap.get(`${sectionId}-${subjectId}`) ?? null;

  const isMobile = useMediaQuery("(max-width: 768px)");
  const [openTooltipKey, setOpenTooltipKey] = useState<string | null>(null);

  if (form.values.selected_sections.length === 0) {
    return (
      <Box>
        <Text size="lg" fw={700} mb="xs" c="#4EAE4A">
          Assign Subjects
        </Text>
        <Text size="sm" c="dimmed">
          No sections selected. Go back and select at least one section first.
        </Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text size="xl" fw={700} mb="md" c="#298925">
        Assign Subjects
      </Text>

      <Box p="lg" style={{ border: "1px solid #B8B8B8", borderRadius: "8px" }}>
        <Text size="lg" fw={700} mb="xs" c="#298925">
          Assign Subjects
        </Text>
        <Text size="sm" mb="lg" c="dimmed">
          Assign subjects per section.{" "}
          <Text span fw={700} size="sm">
            At least one subject per section
          </Text>{" "}
          is required.
        </Text>
        {sortedSelectedSections.map((sectionId) => {
          const section = sections.find((s) => s.section_id === sectionId);
          if (!section) return null;

          const gradeLevel = gradeLevels.find(
            (gl) => gl.grade_level_id === section.grade_level_id,
          );
          const label = gradeLevel
            ? `${gradeLevel.display_name} • ${section.name}`
            : section.name;

          const subjectsForGl = (subjectsByGl.get(section.grade_level_id) ?? [])
            .filter(
              (s) =>
                s.subject_type === "BOTH" || section.section_type === "SSES",
            )
            .sort((a, b) => a.name.localeCompare(b.name));

          const assignment = subjectAssignments.find(
            (a) => a.section_id === sectionId,
          );
          const selectedCount = assignment?.subject_ids.length ?? 0;

          const availableSubjectIds = subjectsForGl
            .filter((s) => !takenByOther(sectionId, s.subject_id))
            .map((s) => s.subject_id);
          const currentSelectedIds = assignment?.subject_ids ?? [];
          const allAvailableSelected =
            availableSubjectIds.length > 0 &&
            availableSubjectIds.every((id) => currentSelectedIds.includes(id));

          const handleSelectAll = () => {
            const updated = subjectAssignments.map((a) => {
              if (a.section_id !== sectionId) return a;
              if (allAvailableSelected) {
                return {
                  ...a,
                  subject_ids: a.subject_ids.filter(
                    (id) => !availableSubjectIds.includes(id),
                  ),
                };
              }
              return {
                ...a,
                subject_ids: [
                  ...new Set([...a.subject_ids, ...availableSubjectIds]),
                ],
              };
            });
            form.setFieldValue("subject_assignments", updated);
          };

          return (
            <SectionBlock
              key={sectionId}
              label={label}
              selectedCount={selectedCount}
            >
              {subjectsForGl.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No subjects defined for this grade level.
                </Text>
              ) : (
                <>
                  {availableSubjectIds.length > 0 && (
                    <>
                      <Checkbox
                        checked={allAvailableSelected}
                        indeterminate={
                          !allAvailableSelected &&
                          availableSubjectIds.some((id) =>
                            currentSelectedIds.includes(id),
                          )
                        }
                        onChange={handleSelectAll}
                        label="Select All"
                        fw={500}
                        mb="xs"
                      />
                      <Divider mb="xs" />
                    </>
                  )}
                  {subjectsForGl.map((subject) => {
                    const teacher = takenByOther(sectionId, subject.subject_id);
                    const isChecked =
                      assignment?.subject_ids.includes(subject.subject_id) ??
                      false;

                    return (
                      <Group
                        key={subject.subject_id}
                        mb="xs"
                        gap="xs"
                        align="center"
                      >
                        <Checkbox
                          checked={isChecked}
                          onChange={() =>
                            !teacher &&
                            toggleSubject(sectionId, subject.subject_id)
                          }
                          disabled={!!teacher}
                          label={`(${subject.code}) ${subject.name}`}
                        />
                        {teacher && (
                          <Tooltip
                            label={`Assigned to: ${teacher}`}
                            position="right"
                            withArrow
                            opened={isMobile ? openTooltipKey === `${sectionId}-${subject.subject_id}` : undefined}
                          >
                            <IconUser
                              size={14}
                              color="#aaa"
                              style={{ cursor: isMobile ? "pointer" : "help" }}
                              onClick={isMobile ? () => {
                                const key = `${sectionId}-${subject.subject_id}`;
                                setOpenTooltipKey(openTooltipKey === key ? null : key);
                              } : undefined}
                            />
                          </Tooltip>
                        )}
                      </Group>
                    );
                  })}
                </>
              )}
            </SectionBlock>
          );
        })}
      </Box>
    </Box>
  );
}
