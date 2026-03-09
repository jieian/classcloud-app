"use client";

import { useState } from "react";
import {
  ActionIcon,
  Group,
  Loader,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import type { SubjectRow, SectionType } from "../../_lib/subjectService";
import DeleteSubjectModal from "./DeleteSubjectModal";
import EditSubjectDrawer from "./EditSubjectDrawer";

interface SubjectTableProps {
  subjects: SubjectRow[];
  gradeLevelDisplay: string;
  sectionType?: SectionType;
  teachersLoading?: boolean;
  onUpdate: () => void;
}

export default function SubjectTable({
  subjects,
  gradeLevelDisplay,
  sectionType = "REGULAR",
  teachersLoading = false,
  onUpdate,
}: SubjectTableProps) {
  const [selectedSubject, setSelectedSubject] = useState<SubjectRow | null>(
    null,
  );
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] =
    useDisclosure(false);

  const [deleteSubject, setDeleteSubject] = useState<SubjectRow | null>(null);
  const [deleteOpened, { open: openDelete, close: closeDelete }] =
    useDisclosure(false);

  function handleEditClick(subject: SubjectRow) {
    setSelectedSubject(subject);
    openDrawer();
  }

  function handleDeleteClick(subject: SubjectRow) {
    setDeleteSubject(subject);
    openDelete();
  }

  if (subjects.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No subjects found
      </Text>
    );
  }

  const rows = subjects.map((subject) => (
    <TableTr key={subject.subject_id}>
      <TableTd>
        <Text fz="sm" fw={500}>
          {subject.code}
        </Text>
      </TableTd>
      <TableTd>
        <Text fz="sm">{subject.name}</Text>
      </TableTd>
      <TableTd>
        {subject.description ? (
          <Text fz="sm">{subject.description}</Text>
        ) : (
          <Text fz="sm" c="dimmed">
            —
          </Text>
        )}
      </TableTd>
      <TableTd>
        {subject.teachers.length > 0 ? (
          <Text fz="sm">{subject.teachers.join(", ")}</Text>
        ) : (
          <Text fz="sm" c="dimmed">
            Unassigned
          </Text>
        )}
      </TableTd>
      <TableTd w={80}>
        <Group gap="xs" justify="flex-end">
          <Tooltip label="Edit Subject">
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label="Edit subject"
              onClick={() => handleEditClick(subject)}
            >
              <IconPencil size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete Subject">
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label="Delete subject"
              onClick={() => handleDeleteClick(subject)}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </TableTd>
    </TableTr>
  ));

  return (
    <>
      <TableScrollContainer minWidth={680}>
        <Table verticalSpacing="sm">
          <TableThead>
            <TableTr>
              <TableTh
                colSpan={5}
                ta="center"
                style={{
                  backgroundColor: sectionType === "SSES" ? "#248ce6" : "gray",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                }}
              >
                {gradeLevelDisplay}
              </TableTh>
            </TableTr>
            <TableTr>
              <TableTh w="10%">Subject Code</TableTh>
              <TableTh w="22%">Name</TableTh>
              <TableTh w="38%">Description</TableTh>
              <TableTh w="22%">
                <Group gap={6} align="center" wrap="nowrap">
                  Teacher
                  {teachersLoading && <Loader size={12} color="gray" />}
                </Group>
              </TableTh>
              <TableTh w={80} ta="right">
                <VisuallyHidden>Actions</VisuallyHidden>
              </TableTh>
            </TableTr>
          </TableThead>
          <TableTbody>{rows}</TableTbody>
        </Table>
      </TableScrollContainer>

      <EditSubjectDrawer
        opened={drawerOpened}
        onClose={closeDrawer}
        subject={selectedSubject}
        onSuccess={onUpdate}
      />

      <DeleteSubjectModal
        opened={deleteOpened}
        onClose={closeDelete}
        subject={deleteSubject}
        onSuccess={onUpdate}
      />
    </>
  );
}
