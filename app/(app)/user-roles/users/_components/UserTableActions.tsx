"use client";

import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { IconAlertTriangle, IconPencil, IconTrash } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { notify } from "@/components/notificationIcon/notificationIcon";
import type { UserWithRoles, UserAssignmentSummary } from "../_lib";
import { deleteUser, fetchUserAssignmentSummary } from "../_lib";

interface UserTableActionsProps {
  user: UserWithRoles;
  onUpdate: () => void;
  onEdit: () => void;
  currentUid: string | null;
}

export default function UserTableActions({
  user,
  onUpdate,
  onEdit,
  currentUid,
}: UserTableActionsProps) {
  const [deleteOpened, { open: openDelete, close: closeDelete }] =
    useDisclosure(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [assignments, setAssignments] = useState<UserAssignmentSummary | null>(null);

  const isSelf = currentUid === user.uid;

  const fullName = `${user.first_name} ${user.last_name}`;

  const handleTrashClick = async () => {
    if (isSelf) return;
    try {
      setChecking(true);
      const summary = await fetchUserAssignmentSummary(user.uid);
      setAssignments(summary);
      openDelete();
    } catch {
      notify({
        type: "error",
        title: "Error",
        message: "Failed to check this user's assignments. Please try again.",
      });
    } finally {
      setChecking(false);
    }
  };

  const handleCloseDelete = () => {
    setConfirmText("");
    closeDelete();
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      await deleteUser(user.uid, user.email, user.first_name);
      handleCloseDelete();
      onUpdate();
      notify({
        type: "success",
        title: "User Deleted",
        message: `${fullName} has been deleted.`,
      });
    } catch (err) {
      console.error("Failed to delete user:", err);
      notify({
        type: "error",
        title: "Delete Failed",
        message: err instanceof Error ? err.message : "Something went wrong. Please try again.",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Group gap={0} justify="flex-end">
        <Tooltip label="Edit User">
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Edit user"
            onClick={onEdit}
          >
            <IconPencil size={16} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="You cannot delete your own account" disabled={!isSelf}>
          <Tooltip label="Delete User" disabled={isSelf}>
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label="Delete user"
              onClick={handleTrashClick}
              disabled={isSelf}
              loading={checking}
            >
              <IconTrash size={16} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        </Tooltip>
      </Group>

      <Modal
        opened={deleteOpened}
        onClose={handleCloseDelete}
        title="Delete User"
        centered
      >
        {assignments &&
          (assignments.advisory > 0 ||
            assignments.teaching > 0 ||
            assignments.gsl !== null ||
            assignments.coordinator !== null) && (
            <Alert
              variant="filled"
              radius="md"
              mb="md"
              styles={{
                root: { backgroundColor: "#fae173" },
                icon: { alignSelf: "center", marginTop: 0 },
              }}
              icon={
                <ThemeIcon color="#2A2A2A" variant="transparent" size="md">
                  <IconAlertTriangle size={20} />
                </ThemeIcon>
              }
            >
              <Text fw={700} size="sm" c="#2A2A2A">
                Active Assignments
              </Text>
              <Text size="sm" fs="italic" c="#2A2A2A">
                This user currently holds active assignments (advisory, teaching,
                coordinator, or grade subject leader). Deleting the account will
                remove all of them.
              </Text>
            </Alert>
          )}
        <Text size="sm" mb="md">
          Are you sure you want to delete <strong>{fullName}</strong>? This
          action cannot be undone.
        </Text>
        <Text size="sm" mb="md" c="dimmed">
          Type{" "}
          <Text span fw={700} c="var(--mantine-color-text)">
            delete
          </Text>{" "}
          to confirm.
        </Text>
        <TextInput
          placeholder="Type delete to confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.currentTarget.value)}
          mb="lg"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={handleCloseDelete}>
            Cancel
          </Button>
          <Button
            color="red"
            disabled={confirmText.toLowerCase() !== "delete"}
            loading={deleting}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </Group>
      </Modal>
    </>
  );
}
