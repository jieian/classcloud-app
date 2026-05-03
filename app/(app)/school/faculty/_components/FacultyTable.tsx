"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Collapse,
  Divider,
  Group,
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
import { useClickOutside, useDisclosure } from "@mantine/hooks";
import { IconChevronRight } from "@tabler/icons-react";
import type { FacultyMember } from "../_lib/facultyService";
import FacultyTableActions from "./FacultyTableActions";
import SubjectBadge from "./SubjectBadge";
import SubjectOverflowCard from "./SubjectOverflowCard";

const MAX_VISIBLE_SUBJECTS = 3;

// ── Mobile accordion row ──────────────────────────────────────────────────────

function FacultyMobileRow({
  member,
  onUpdate,
}: {
  member: FacultyMember;
  onUpdate: () => void;
}) {
  const [opened, { toggle }] = useDisclosure(false);

  const advisoryClass = member.advisory_section
    ? `${member.advisory_section.grade_level_display} • ${member.advisory_section.section_name}`
    : null;

  const visibleSubjects = member.teaching_subjects.slice(0, MAX_VISIBLE_SUBJECTS);
  const overflowSubjects = member.teaching_subjects.slice(MAX_VISIBLE_SUBJECTS);

  return (
    <>
      <div onClick={toggle} style={{ cursor: "pointer", padding: "12px 4px" }}>
        <Group justify="space-between" wrap="nowrap" align="center">
          <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
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
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {member.first_name} {member.last_name}
            </Text>
          </Group>
          <div onClick={(e) => e.stopPropagation()}>
            <FacultyTableActions faculty={member} onUpdate={onUpdate} />
          </div>
        </Group>
      </div>

      <Collapse in={opened}>
        <Box pb="md" pl={28} pr={4}>
          <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={2} style={{ letterSpacing: "0.04em" }}>
            Advisory Class
          </Text>
          {advisoryClass ? (
            <Text fz="sm" mb="sm">{advisoryClass}</Text>
          ) : (
            <Text fz="sm" c="dimmed" fs="italic" mb="sm">None</Text>
          )}

          <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={6} style={{ letterSpacing: "0.04em" }}>
            Teaching Load
          </Text>
          {member.teaching_subjects.length === 0 ? (
            <Text fz="sm" c="dimmed" fs="italic">None</Text>
          ) : (
            <Group gap={6} wrap="wrap">
              {visibleSubjects.map((s) => (
                <SubjectBadge
                  key={s.code}
                  code={s.code}
                  subject_type={s.subject_type}
                  subjectName={s.name}
                  palette="coordinator"
                  sections={s.sections}
                />
              ))}
              {overflowSubjects.length > 0 && (
                <SubjectOverflowCard subjects={overflowSubjects} />
              )}
            </Group>
          )}
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface FacultyTableProps {
  faculty: FacultyMember[];
  onUpdate: () => void;
}

export default function FacultyTable({ faculty, onUpdate }: FacultyTableProps) {
  const router = useRouter();
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const tableRef = useClickOutside(() => setSelectedUid(null));

  function handleRowClick(member: FacultyMember) {
    if (selectedUid === member.uid) {
      router.push(`/school/faculty/create?uid=${member.uid}`);
    } else {
      setSelectedUid(member.uid);
    }
  }

  if (faculty.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No faculty found
      </Text>
    );
  }

  const tableRows = faculty.map((member) => {
    const advisoryClass = member.advisory_section
      ? `${member.advisory_section.grade_level_display} • ${member.advisory_section.section_name}`
      : null;

    const visibleSubjects = member.teaching_subjects.slice(0, MAX_VISIBLE_SUBJECTS);
    const overflowSubjects = member.teaching_subjects.slice(MAX_VISIBLE_SUBJECTS);
    const isSelected = selectedUid === member.uid;

    return (
      <TableTr
        key={member.uid}
        onClick={(e) => {
          e.stopPropagation();
          handleRowClick(member);
        }}
        style={{
          cursor: "pointer",
          backgroundColor: isSelected ? "#f0f7ee" : undefined,
          transition: "background-color 0.15s ease",
        }}
      >
        <TableTd>
          <Text size="sm" fw={500}>
            {member.first_name} {member.last_name}
          </Text>
        </TableTd>
        <TableTd>
          {advisoryClass ? (
            <Text size="sm">{advisoryClass}</Text>
          ) : (
            <Text c="dimmed" size="sm" fs="italic">None</Text>
          )}
        </TableTd>
        <TableTd>
          {member.teaching_subjects.length === 0 ? (
            <Text c="dimmed" size="sm" fs="italic">None</Text>
          ) : (
            <Group gap={6} wrap="nowrap">
              {visibleSubjects.map((s) => (
                <SubjectBadge
                  key={s.code}
                  code={s.code}
                  subject_type={s.subject_type}
                  subjectName={s.name}
                  palette="coordinator"
                  sections={s.sections}
                />
              ))}
              {overflowSubjects.length > 0 && (
                <SubjectOverflowCard subjects={overflowSubjects} />
              )}
            </Group>
          )}
        </TableTd>
        <TableTd w={72}>
          <div onClick={(e) => e.stopPropagation()}>
            <FacultyTableActions faculty={member} onUpdate={onUpdate} />
          </div>
        </TableTd>
      </TableTr>
    );
  });

  return (
    <>
      {/* Desktop table — hidden on mobile */}
      <div className="hidden sm:block">
        <TableScrollContainer minWidth={1080} type="native" ref={tableRef}>
          <Table
            verticalSpacing="sm"
            horizontalSpacing="md"
            highlightOnHover
            style={{ tableLayout: "fixed" }}
          >
            <colgroup>
              <col style={{ width: "26%" }} />
              <col style={{ width: "24%" }} />
              <col style={{ width: "42%" }} />
              <col style={{ width: "72px" }} />
            </colgroup>
            <TableThead>
              <TableTr>
                <TableTh w="26%">Employee</TableTh>
                <TableTh w="24%">Advisory Class</TableTh>
                <TableTh>Teaching Load</TableTh>
                <TableTh w={72} ta="right">
                  <VisuallyHidden>Actions</VisuallyHidden>
                </TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>{tableRows}</TableTbody>
          </Table>
        </TableScrollContainer>
      </div>

      {/* Mobile accordion list — hidden on sm+ */}
      <div className="sm:hidden">
        <Divider />
        {faculty.map((member) => (
          <FacultyMobileRow
            key={member.uid}
            member={member}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    </>
  );
}
