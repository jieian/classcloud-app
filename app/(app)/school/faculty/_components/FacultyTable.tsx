import {
  Anchor,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  VisuallyHidden,
} from "@mantine/core";
import { useMemo } from "react";
import type { FacultyMember } from "../_lib/facultyService";
import FacultyTableActions from "./FacultyTableActions";

// Sort key: [group, gradeLevel, sectionName, lastName, firstName]
// group 0 = no advisory (top), group 1 = has advisory (bottom)
type SortKey = [number, number, string, string, string];

function getSortKey(m: FacultyMember): SortKey {
  if (!m.advisory_section) {
    return [0, 0, "", m.last_name, m.first_name];
  }
  const grade =
    parseInt(m.advisory_section.grade_level_display.replace(/\D/g, ""), 10) ||
    999;
  return [1, grade, m.advisory_section.section_name, m.last_name, m.first_name];
}

function compareSortKeys(a: SortKey, b: SortKey): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

interface FacultyTableProps {
  faculty: FacultyMember[];
  onUpdate: () => void;
}

export default function FacultyTable({ faculty, onUpdate }: FacultyTableProps) {
  const sorted = useMemo(() => {
    const keyed = faculty.map((m) => ({ member: m, key: getSortKey(m) }));
    keyed.sort((a, b) => compareSortKeys(a.key, b.key));
    return keyed.map(({ member }) => member);
  }, [faculty]);

  if (sorted.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No faculty found
      </Text>
    );
  }

  const rows = sorted.map((member) => {
    const fullName = `${member.first_name} ${member.last_name}`;
    const advisoryClass = member.advisory_section
      ? `${member.advisory_section.grade_level_display} • ${member.advisory_section.section_name}`
      : null;

    return (
      <TableTr key={member.uid}>
        <TableTd>
          <Text fz="sm" fw={500}>
            {fullName}
          </Text>
        </TableTd>
        <TableTd>
          {advisoryClass ? (
            <Text fz="sm">{advisoryClass}</Text>
          ) : (
            <Text fz="sm" c="dimmed">
              No advisory class
            </Text>
          )}
        </TableTd>
        <TableTd>
          <Anchor component="button" size="sm">
            {member.email}
          </Anchor>
        </TableTd>
        <TableTd w={72}>
          <FacultyTableActions faculty={member} onUpdate={onUpdate} />
        </TableTd>
      </TableTr>
    );
  });

  return (
    <TableScrollContainer minWidth={680}>
      <Table verticalSpacing="sm">
        <TableThead>
          <TableTr>
            <TableTh w="24%">Employee</TableTh>
            <TableTh w="24%">Advisory Class</TableTh>
            <TableTh w="42%">Email</TableTh>
            <TableTh w={72} ta="right">
              <VisuallyHidden>Actions</VisuallyHidden>
            </TableTh>
          </TableTr>
        </TableThead>
        <TableTbody>{rows}</TableTbody>
      </Table>
    </TableScrollContainer>
  );
}
