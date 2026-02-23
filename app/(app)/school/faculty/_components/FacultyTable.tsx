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
import type { FacultyMember } from "../_lib/facultyService";
import FacultyTableActions from "./FacultyTableActions";

interface FacultyTableProps {
  faculty: FacultyMember[];
  onUpdate: () => void;
}

export default function FacultyTable({ faculty, onUpdate }: FacultyTableProps) {
  if (faculty.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No faculty found
      </Text>
    );
  }

  const rows = faculty.map((member) => {
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
