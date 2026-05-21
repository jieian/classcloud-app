"use client";

import { useState } from "react";
import { ActionIcon, Group, Text, Tooltip } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconSettings, IconTrash } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notify } from "@/components/notificationIcon/notificationIcon";
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
  const isMobile = useMediaQuery("(max-width: 768px)");
  const confirmModalProps = isMobile
    ? {
        styles: {
          inner: { alignItems: "flex-end", paddingBottom: "20px" },
          content: { width: "100%", maxWidth: "100%", borderRadius: "12px 12px 0 0" },
        },
      }
    : {};

  const handleRemove = () => {
    const facultyName = `${faculty.first_name} ${faculty.last_name}`;

    modals.openConfirmModal({
      title: "Remove Teaching Load?",
      children: (
        <Text size="sm">
          This will remove all advisory and teaching load for{" "}
          <strong>{facultyName}</strong>, and revoke their faculty role. This
          action cannot be undone.
        </Text>
      ),
      labels: { confirm: "Remove", cancel: "Cancel" },
      confirmProps: { color: "red" },
      ...confirmModalProps,
      onConfirm: async () => {
        try {
          setRemoving(true);
          await removeAcademicLoad(faculty.uid);
          notify({
            type: "success",
            title: "Removed",
            message: `Teaching load for ${facultyName} has been removed.`,
          });
          onUpdate();
          router.refresh();
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to remove teaching load.";
          notify({
            type: "error",
            title: "Error",
            message,
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
          <IconSettings size={16} stroke={1.5} color="gray" />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Remove Teaching Load">
        <ActionIcon
          variant="subtle"
          color="red"
          aria-label="Remove Teaching Load"
          loading={removing}
          onClick={handleRemove}
        >
          <IconTrash size={16} stroke={1.5} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
