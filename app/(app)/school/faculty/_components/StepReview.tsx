"use client";

import { Box, Text, Table, Group, Pagination } from "@mantine/core";
import { useState, useMemo } from "react";
import type { UseFormReturnType } from "@mantine/form";
import type {
  AddFacultyForm,
  GradeLevel,
  SectionWithAdviser,
  SubjectForGradeLevel,
} from "../_lib/teachingLoadService";

interface StepReviewProps {
  form: UseFormReturnType<AddFacultyForm>;
  facultyName: string;
  gradeLevels: GradeLevel[];
  sections: SectionWithAdviser[];
  subjectsByGradeLevel: SubjectForGradeLevel[];
}

const PAGE_SIZE = 3;

function formatSubjects(names: string[]): string {
  if (names.length === 0) return "—";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  const last = names[names.length - 1];
  const rest = names.slice(0, -1).join(", ");
  return `${rest}, & ${last}`;
}

export default function StepReview({
  form,
  facultyName,
  gradeLevels,
  sections,
  subjectsByGradeLevel,
}: StepReviewProps) {
  const [page, setPage] = useState(1);

  // O(1) lookup maps built once from static props
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

  const advisorySection =
    form.values.advisory_section_id !== null
      ? sectionMap.get(form.values.advisory_section_id) ?? null
      : null;
  const advisoryGradeLevel = advisorySection
    ? gradeLevelMap.get(advisorySection.grade_level_id) ?? null
    : null;

  const academicLoadRows = form.values.subject_assignments.map((assignment) => {
    const section = sectionMap.get(assignment.section_id);
    const gradeLevel = section ? gradeLevelMap.get(section.grade_level_id) : null;
    const subjectNames = assignment.subject_ids.map((sid) => {
      const subj = subjectMap.get(sid);
      return subj ? subj.name : `Subject ${sid}`;
    });
    return {
      key: assignment.section_id,
      grade_level: gradeLevel?.display_name ?? "—",
      section_name: section?.name ?? "—",
      subjects: formatSubjects(subjectNames),
    };
  });

  const totalPages = Math.max(1, Math.ceil(academicLoadRows.length / PAGE_SIZE));
  const paginatedRows = academicLoadRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Box>
      <Text size="lg" fw={700} mb="xs" c="#4EAE4A">
        Review &amp; Assign
      </Text>
      <Text size="sm" c="dimmed" mb="lg">
        Review the academic load for <strong>{facultyName}</strong> before confirming.
      </Text>

      <Box p="lg" style={{ border: "1px solid #e0e0e0", borderRadius: "8px" }}>
        {/* Advisory Class */}
        <Box mb="lg">
          <Text size="sm" fw={600} mb="xs">
            Advisory Class
          </Text>
          {advisorySection && advisoryGradeLevel ? (
            <Table withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Grade Level</Table.Th>
                  <Table.Th>Section</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>{advisoryGradeLevel.display_name}</Table.Td>
                  <Table.Td>{advisorySection.name}</Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
          ) : (
            <Text size="sm" c="dimmed">
              No advisory class selected.
            </Text>
          )}
        </Box>

        {/* Academic Load */}
        <Box>
          <Text size="sm" fw={600} mb="xs">
            Academic Load
          </Text>
          {academicLoadRows.length === 0 ? (
            <Text size="sm" c="dimmed">
              No subject assignments.
            </Text>
          ) : (
            <>
              <Table withTableBorder withColumnBorders>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Grade Level</Table.Th>
                    <Table.Th>Section</Table.Th>
                    <Table.Th>Subject(s)</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {paginatedRows.map((row) => (
                    <Table.Tr key={row.key}>
                      <Table.Td>{row.grade_level}</Table.Td>
                      <Table.Td>{row.section_name}</Table.Td>
                      <Table.Td>{row.subjects}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              {totalPages > 1 && (
                <Group justify="center" mt="sm">
                  <Pagination value={page} onChange={setPage} total={totalPages} size="sm" />
                </Group>
              )}
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
