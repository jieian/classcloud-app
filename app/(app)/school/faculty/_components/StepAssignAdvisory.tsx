"use client";

import {
  Box,
  Text,
  Badge,
  Radio,
  Group,
  Collapse,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useState, useMemo } from "react";
import { IconChevronDown, IconUser } from "@tabler/icons-react";
import type { UseFormReturnType } from "@mantine/form";
import type { AddFacultyForm, GradeLevel, SectionWithAdviser } from "../_lib/teachingLoadService";

interface StepAssignAdvisoryProps {
  form: UseFormReturnType<AddFacultyForm>;
  gradeLevels: GradeLevel[];
  sections: SectionWithAdviser[];
  facultyUid: string;
}

interface GradeLevelBarProps {
  gradeLevel: GradeLevel;
  isHighlighted: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function GradeLevelBar({
  gradeLevel,
  isHighlighted,
  defaultOpen = false,
  children,
}: GradeLevelBarProps) {
  const [opened, setOpened] = useState(defaultOpen);

  return (
    <Box mb="xs">
      <UnstyledButton
        onClick={() => setOpened((o) => !o)}
        style={{
          width: "100%",
          backgroundColor: isHighlighted ? "#4EAE4A" : "#f8f9fa",
          padding: "10px 16px",
          borderRadius: 8,
          transition: "background-color 200ms ease",
        }}
      >
        <Group justify="space-between">
          <Text fw={600} size="sm" c={isHighlighted ? "white" : "inherit"}>
            {gradeLevel.display_name}
          </Text>
          <IconChevronDown
            size={16}
            color={isHighlighted ? "white" : "#555"}
            style={{
              transform: opened ? "rotate(180deg)" : undefined,
              transition: "transform 200ms ease",
            }}
          />
        </Group>
      </UnstyledButton>
      <Collapse in={opened}>
        <Box pl="md" py="sm">
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}

export default function StepAssignAdvisory({
  form,
  gradeLevels,
  sections,
  facultyUid,
}: StepAssignAdvisoryProps) {
  const selectedSectionId = form.values.advisory_section_id;

  const handleChange = (value: string) => {
    form.setFieldValue(
      "advisory_section_id",
      value === "none" ? null : parseInt(value, 10),
    );
  };

  // Pre-group sections by grade level — SSES first, then alphabetical
  const sectionsByGl = useMemo(() => {
    const map = new Map<number, SectionWithAdviser[]>();
    for (const s of sections) {
      const existing = map.get(s.grade_level_id);
      if (existing) existing.push(s);
      else map.set(s.grade_level_id, [s]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.section_type === b.section_type) return a.name.localeCompare(b.name);
        return a.section_type === "SSES" ? -1 : 1;
      });
    }
    return map;
  }, [sections]);

  // Grade level ID of the selected section — O(1) via map
  const selectedGlId = useMemo(
    () =>
      selectedSectionId !== null
        ? (sections.find((s) => s.section_id === selectedSectionId)?.grade_level_id ?? null)
        : null,
    [selectedSectionId, sections],
  );

  return (
    <Box>
      <Text size="lg" fw={700} mb="xs" c="#4EAE4A">
        Assign Advisory Class
      </Text>
      <Text size="sm" c="dimmed" mb="lg">
        Advisory class is optional. Select a section or choose &quot;No Advisory Class&quot; to skip.
      </Text>

      <Box p="lg" style={{ border: "1px solid #e0e0e0", borderRadius: "8px" }}>
        <Radio.Group
          value={selectedSectionId !== null ? selectedSectionId.toString() : "none"}
          onChange={handleChange}
        >
          <Radio value="none" label="No Advisory Class" mb="md" />

          {gradeLevels.map((gl) => {
            const glSections = sectionsByGl.get(gl.grade_level_id);
            if (!glSections || glSections.length === 0) return null;
            const highlighted = selectedGlId === gl.grade_level_id;

            return (
              <GradeLevelBar
                key={gl.grade_level_id}
                gradeLevel={gl}
                isHighlighted={highlighted}
                defaultOpen={highlighted}
              >
                {glSections.map((section) => {
                  const isTakenByOther =
                    section.adviser_id !== null && section.adviser_id !== facultyUid;

                  return (
                    <Group key={section.section_id} mb="xs" gap="xs" align="center">
                      <Radio
                        value={section.section_id.toString()}
                        label={section.name}
                        disabled={isTakenByOther}
                      />
                      <Badge
                        size="xs"
                        variant="light"
                        color={section.section_type === "SSES" ? "blue" : "gray"}
                      >
                        {section.section_type === "SSES" ? "SSES" : "Regular"}
                      </Badge>
                      {isTakenByOther && section.adviser_name && (
                        <Tooltip
                          label={`Adviser: ${section.adviser_name}`}
                          position="right"
                          withArrow
                        >
                          <IconUser size={14} color="#aaa" style={{ cursor: "help" }} />
                        </Tooltip>
                      )}
                    </Group>
                  );
                })}
              </GradeLevelBar>
            );
          })}
        </Radio.Group>
      </Box>
    </Box>
  );
}
