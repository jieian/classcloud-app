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
} from "../_lib/teachingLoadService";

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
    <Paper withBorder radius="md" mb="xs" style={{ overflow: "hidden" }}>
      <UnstyledButton
        onClick={() => setOpened((o) => !o)}
        style={{
          width: "100%",
          padding: "12px 16px",
          backgroundColor: isHighlighted ? "#4EAE4A" : undefined,
        }}
      >
        <Group justify="space-between">
          <Text fw={700} size="sm" c={isHighlighted ? "white" : "inherit"}>
            {gradeLevel.display_name}
          </Text>
          {opened ? (
            <IconChevronUp size={16} color={isHighlighted ? "white" : "#808898"} />
          ) : (
            <IconChevronDown size={16} color={isHighlighted ? "white" : "#808898"} />
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

export default function StepAssignAdvisory({
  form,
  gradeLevels,
  sections,
  facultyUid,
}: StepAssignAdvisoryProps) {
  const selectedSectionId = form.values.advisory_section_id;
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [openTooltipId, setOpenTooltipId] = useState<number | null>(null);

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
        if (a.section_type === b.section_type)
          return a.name.localeCompare(b.name);
        return a.section_type === "SSES" ? -1 : 1;
      });
    }
    return map;
  }, [sections]);

  // Grade level ID of the selected section — O(1) via map
  const selectedGlId = useMemo(
    () =>
      selectedSectionId !== null
        ? (sections.find((s) => s.section_id === selectedSectionId)
            ?.grade_level_id ?? null)
        : null,
    [selectedSectionId, sections],
  );

  return (
    <Box>
      <Text size="xl" fw={700} mb="md" c="#298925">
        Advisory Class
      </Text>

      <Box p="lg" style={{ border: "1px solid #B8B8B8", borderRadius: "8px" }}>
        <Text size="lg" fw={700} mb="xs" c="#298925">
          Advisory Class
        </Text>
        <Text size="sm" mb="lg" c="dimmed">
          <Text span fw={700} size="sm">
            Optional.
          </Text>{" "}
          Assign an advisory class to designate this faculty member as the
          section's homeroom adviser.
        </Text>

        {/* "No Advisory Class" — modern card-style selector */}
        <UnstyledButton
          onClick={() => handleChange("none")}
          mb="md"
          style={{
            display: "block",
            width: "100%",
            padding: "10px 14px",
            borderRadius: 8,
            border: `2px solid ${selectedSectionId === null ? "#adb5bd" : "#dee2e6"}`,
            backgroundColor: selectedSectionId === null ? "#f1f3f5" : "#f1f3f5",
            cursor: "pointer",
            transition: "border-color 150ms ease, background-color 150ms ease",
          }}
        >
          <Group gap="sm" align="center">
            <Box
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: `2px solid ${selectedSectionId === null ? "#adb5bd" : "#ced4da"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "border-color 150ms ease",
              }}
            >
              {selectedSectionId === null && (
                <Box
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: "#adb5bd",
                  }}
                />
              )}
            </Box>
            <Text
              fw={selectedSectionId === null ? 600 : 500}
              size="sm"
              c={selectedSectionId === null ? "#495057" : "#868e96"}
            >
              No Advisory Class
            </Text>
          </Group>
        </UnstyledButton>

        <Radio.Group
          value={
            selectedSectionId !== null ? selectedSectionId.toString() : "none"
          }
          onChange={handleChange}
        >
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
                    section.adviser_id !== null &&
                    section.adviser_id !== facultyUid;

                  return (
                    <Group
                      key={section.section_id}
                      mb="xs"
                      gap="xs"
                      align="center"
                    >
                      <Radio
                        value={section.section_id.toString()}
                        label={section.name}
                        disabled={isTakenByOther}
                      />
                      <Badge
                        size="xs"
                        variant="filled"
                        radius="xl"
                        style={{
                          backgroundColor:
                            section.section_type === "SSES"
                              ? "#70A2FF"
                              : "#B3B4B4",
                          color: "#fff",
                        }}
                      >
                        {section.section_type === "SSES" ? "SSES" : "Regular"}
                      </Badge>
                      {isTakenByOther && section.adviser_name && (
                        <Tooltip
                          label={`Adviser: ${section.adviser_name}`}
                          position="right"
                          withArrow
                          opened={isMobile ? openTooltipId === section.section_id : undefined}
                        >
                          <IconUser
                            size={14}
                            color="#aaa"
                            style={{ cursor: isMobile ? "pointer" : "help" }}
                            onClick={isMobile ? () =>
                              setOpenTooltipId(
                                openTooltipId === section.section_id
                                  ? null
                                  : section.section_id,
                              ) : undefined}
                          />
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
