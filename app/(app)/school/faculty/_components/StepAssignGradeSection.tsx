"use client";

import {
  Box,
  Text,
  Badge,
  Checkbox,
  Group,
  Collapse,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useState, useMemo } from "react";
import { IconChevronDown, IconLock } from "@tabler/icons-react";
import type { UseFormReturnType } from "@mantine/form";
import type {
  AddFacultyForm,
  GradeLevel,
  SectionWithAdviser,
  SubjectForGradeLevel,
  TeacherAssignment,
} from "../_lib/teachingLoadService";

interface StepAssignGradeSectionProps {
  form: UseFormReturnType<AddFacultyForm>;
  gradeLevels: GradeLevel[];
  sections: SectionWithAdviser[];
  subjectsByGradeLevel: SubjectForGradeLevel[];
  allAssignments: TeacherAssignment[];
  facultyUid: string;
}

interface GradeLevelBarProps {
  gradeLevel: GradeLevel;
  count: number;
  children: React.ReactNode;
}

function GradeLevelBar({ gradeLevel, count, children }: GradeLevelBarProps) {
  const [opened, setOpened] = useState(false);

  return (
    <Box mb="xs">
      <UnstyledButton
        onClick={() => setOpened((o) => !o)}
        style={{ width: "100%", backgroundColor: "#f8f9fa", padding: "10px 16px", borderRadius: 8 }}
      >
        <Group justify="space-between">
          <Text fw={600} size="sm">
            {gradeLevel.display_name}
            {count > 0 && (
              <Text span c="#4EAE4A" fw={700}>
                {" "}({count})
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

export default function StepAssignGradeSection({
  form,
  gradeLevels,
  sections,
  subjectsByGradeLevel,
  allAssignments,
  facultyUid,
}: StepAssignGradeSectionProps) {
  const selectedSections = form.values.selected_sections;

  const toggleSection = (sectionId: number) => {
    if (selectedSections.includes(sectionId)) {
      form.setFieldValue("selected_sections", selectedSections.filter((id) => id !== sectionId));
    } else {
      form.setFieldValue("selected_sections", [...selectedSections, sectionId]);
    }
  };

  // Map: section_id → grade_level_id (built once, not per-render)
  const sectionGradeLevelMap = useMemo(
    () => new Map(sections.map((s) => [s.section_id, s.grade_level_id])),
    [sections],
  );

  // Set of "sectionId-subjectId" keys taken by other teachers (built once)
  const takenKeys = useMemo(
    () =>
      new Set(
        allAssignments
          .filter((a) => a.teacher_id !== facultyUid)
          .map((a) => `${a.section_id}-${a.subject_id}`),
      ),
    [allAssignments, facultyUid],
  );

  // Map: grade_level_id → subject_ids for that grade (built once)
  const subjectIdsByGl = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const s of subjectsByGradeLevel) {
      const existing = map.get(s.grade_level_id);
      if (existing) existing.push(s.subject_id);
      else map.set(s.grade_level_id, [s.subject_id]);
    }
    return map;
  }, [subjectsByGradeLevel]);

  // O(1) lookup: is every subject in this section taken by someone else?
  const isAllSubjectsTaken = (section: SectionWithAdviser): boolean => {
    const subjectIds = subjectIdsByGl.get(section.grade_level_id);
    if (!subjectIds || subjectIds.length === 0) return false;
    return subjectIds.every((sid) => takenKeys.has(`${section.section_id}-${sid}`));
  };

  // O(1) lookup: how many selected sections belong to this grade level?
  const selectedCountForGl = (gradeLevelId: number) =>
    selectedSections.filter(
      (sid) => sectionGradeLevelMap.get(sid) === gradeLevelId,
    ).length;

  return (
    <Box>
      <Text size="lg" fw={700} mb="xs" c="#4EAE4A">
        Assign Grade &amp; Section
      </Text>
      <Text size="sm" c="dimmed" mb="lg">
        Select the sections where this faculty will teach. Must choose at least one.
      </Text>

      <Box p="lg" style={{ border: "1px solid #e0e0e0", borderRadius: "8px" }}>
        {gradeLevels.map((gl) => {
          const glSections = sections.filter((s) => s.grade_level_id === gl.grade_level_id);
          if (glSections.length === 0) return null;

          return (
            <GradeLevelBar key={gl.grade_level_id} gradeLevel={gl} count={selectedCountForGl(gl.grade_level_id)}>
              {glSections.map((section) => {
                const allTaken = isAllSubjectsTaken(section);
                const isChecked = selectedSections.includes(section.section_id);

                return (
                  <Group key={section.section_id} mb="xs" gap="xs" align="center">
                    <Checkbox
                      checked={isChecked}
                      onChange={() => !allTaken && toggleSection(section.section_id)}
                      disabled={allTaken}
                      label={section.name}
                    />
                    <Badge
                      size="xs"
                      variant="light"
                      color={section.section_type === "SSES" ? "blue" : "gray"}
                    >
                      {section.section_type === "SSES" ? "SSES" : "Regular"}
                    </Badge>
                    {allTaken && (
                      <Tooltip
                        label="All subjects in this section are already assigned to other teachers."
                        position="right"
                        withArrow
                        multiline
                        maw={220}
                      >
                        <IconLock size={14} color="#aaa" style={{ cursor: "help" }} />
                      </Tooltip>
                    )}
                  </Group>
                );
              })}
            </GradeLevelBar>
          );
        })}
      </Box>
    </Box>
  );
}
