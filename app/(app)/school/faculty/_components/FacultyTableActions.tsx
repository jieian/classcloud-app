"use client";

import { useState } from "react";
import { ActionIcon, Group, Text, Tooltip } from "@mantine/core";
import { IconChalkboardTeacher, IconTrash } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { removeAcademicLoad } from "../_lib/facultyService";
import type { FacultyMember } from "../_lib/facultyService";

interface FacultyTableActionsProps {
  faculty: FacultyMember;
  onUpdate: () => void;
}

export default function FacultyTableActions({
  faculty,
  onUpdate,
}: FacultyTableActionsProps) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  const handleRemove = () => {
    const facultyName = `${faculty.first_name} ${faculty.last_name}`;

    modals.openConfirmModal({
      title: "Remove Academic Load?",
      children: (
        <Text size="sm">
          This will remove all advisory and academic load for{" "}
          <strong>{facultyName}</strong>, and revoke their faculty roles. This
          action cannot be undone.
        </Text>
      ),
      labels: { confirm: "Remove", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          setRemoving(true);
          await removeAcademicLoad(faculty.uid);
          notifications.show({
            title: "Removed",
            message: `Academic load for ${facultyName} has been removed.`,
            color: "green",
          });
          onUpdate();
          router.refresh();
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to remove academic load.";
          notifications.show({
            title: "Error",
            message,
            color: "red",
            autoClose: false,
          });
        } finally {
          setRemoving(false);
        }
      },
    });
  };

  return (
    <Group gap={0} justify="flex-end">
      <Tooltip label="Manage Teaching Load">
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Manage Teaching Load"
          onClick={() =>
            router.push(`/school/faculty/create?uid=${faculty.uid}`)
          }
        >
          <IconChalkboardTeacher size={16} stroke={1.5} color="black" />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Remove Academic Load">
        <ActionIcon
          variant="subtle"
          color="red"
          aria-label="Remove Academic Load"
          loading={removing}
          onClick={handleRemove}
        >
          <IconTrash size={16} stroke={1.5} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
