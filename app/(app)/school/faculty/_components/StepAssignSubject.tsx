"use client";

import {
  Box,
  Text,
  Checkbox,
  Group,
  Collapse,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useState, useMemo } from "react";
import { IconChevronDown, IconUser } from "@tabler/icons-react";
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
    <Box mb="xs">
      <UnstyledButton
        onClick={() => setOpened((o) => !o)}
        style={{ width: "100%", backgroundColor: "#f8f9fa", padding: "10px 16px", borderRadius: 8 }}
      >
        <Group justify="space-between">
          <Text fw={600} size="sm">
            {label}
            {selectedCount > 0 && (
              <Text span c="#4EAE4A" fw={700}>
                {" "}({selectedCount})
              </Text>
            )}
          </Text>
          <IconChevronDown
            size={16}
            color="#555"
            style={{ transform: opened ? "rotate(180deg)" : undefined, transition: "transform 200ms ease" }}
          />
        </Group>
      </UnstyledButton>
      <Collapse in={opened}>
        <Box pl="md" py="sm">{children}</Box>
      </Collapse>
    </Box>
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
      <Text size="lg" fw={700} mb="xs" c="#4EAE4A">
        Assign Subjects
      </Text>
      <Text size="sm" c="dimmed" mb="lg">
        Select at least one subject for each section.
      </Text>

      <Box p="lg" style={{ border: "1px solid #e0e0e0", borderRadius: "8px" }}>
        {form.values.selected_sections.map((sectionId) => {
          const section = sections.find((s) => s.section_id === sectionId);
          if (!section) return null;

          const gradeLevel = gradeLevels.find(
            (gl) => gl.grade_level_id === section.grade_level_id,
          );
          const label = gradeLevel
            ? `${gradeLevel.display_name} • ${section.name}`
            : section.name;

          const subjectsForGl = subjectsByGradeLevel.filter(
            (s) => s.grade_level_id === section.grade_level_id,
          );

          const assignment = subjectAssignments.find((a) => a.section_id === sectionId);
          const selectedCount = assignment?.subject_ids.length ?? 0;

          return (
            <SectionBlock key={sectionId} label={label} selectedCount={selectedCount}>
              {subjectsForGl.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No subjects defined for this grade level.
                </Text>
              ) : (
                subjectsForGl.map((subject) => {
                  const teacher = takenByOther(sectionId, subject.subject_id);
                  const isChecked = assignment?.subject_ids.includes(subject.subject_id) ?? false;

                  return (
                    <Group key={subject.subject_id} mb="xs" gap="xs" align="center">
                      <Checkbox
                        checked={isChecked}
                        onChange={() => !teacher && toggleSubject(sectionId, subject.subject_id)}
                        disabled={!!teacher}
                        label={`(${subject.code}) ${subject.name}`}
                      />
                      {teacher && (
                        <Tooltip
                          label={`Assigned to: ${teacher}`}
                          position="right"
                          withArrow
                        >
                          <IconUser size={14} color="#aaa" style={{ cursor: "help" }} />
                        </Tooltip>
                      )}
                    </Group>
                  );
                })
              )}
            </SectionBlock>
          );
        })}
      </Box>
    </Box>
  );
}
