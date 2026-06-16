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
import { IconAlertTriangle, IconLock, IconPencil, IconTrash } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { notify } from "@/components/notificationIcon/notificationIcon";
import type { RoleWithPermissions } from "../../users/_lib";
import { deleteRole, countUsersAffectedByRoleDeletion } from "../../users/_lib";

interface RolesTableActionsProps {
  role: RoleWithPermissions;
  onUpdate: () => void;
  onEdit: () => void;
}

export default function RolesTableActions({
  role,
  onUpdate,
  onEdit,
}: RolesTableActionsProps) {
  const [deleteOpened, { open: openDelete, close: closeDelete }] =
    useDisclosure(false);

  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [affectedCounts, setAffectedCounts] = useState<{ active: number; pending: number } | null>(null);

  const isProtectedRole = role.is_protected;

  const handleTrashClick = async () => {
    if (isProtectedRole) return;
    try {
      setChecking(true);
      const counts = await countUsersAffectedByRoleDeletion(role.role_id);
      setAffectedCounts(counts);
      openDelete();
    } catch {
      notify({
        type: "error",
        title: "Error",
        message: "Failed to check role status. Please try again.",
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
    if (isProtectedRole) return;
    try {
      setDeleting(true);
      await deleteRole(role.role_id, role.name);
      handleCloseDelete();
      onUpdate();
      notify({
        type: "success",
        title: "Role Deleted",
        message: `${role.name} has been deleted successfully.`,
      });
    } catch (err) {
      notify({
        type: "error",
        title: "Error",
        message:
          err instanceof Error
            ? err.message
            : "An error occurred while deleting the role. Please try again.",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Group gap={0} justify="flex-end">
        {isProtectedRole ? (
          <Tooltip
            label="This role is protected and cannot be edited."
            events={{ hover: true, touch: true, focus: true }}
          >
            <ActionIcon variant="subtle" color="gray" aria-label="Locked role">
              <IconLock size={16} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <>
            <Tooltip
              label="Edit Role"
              events={{ hover: true, touch: true, focus: true }}
            >
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={`Edit ${role.name}`}
                onClick={onEdit}
              >
                <IconPencil size={16} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
            <Tooltip
              label="Delete Role"
              events={{ hover: true, touch: true, focus: true }}
            >
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={`Delete ${role.name}`}
                onClick={handleTrashClick}
                loading={checking}
              >
                <IconTrash size={16} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </>
        )}
      </Group>

      <Modal
        opened={deleteOpened}
        onClose={handleCloseDelete}
        title="Delete Role"
        centered
        closeOnClickOutside={!deleting}
        closeOnEscape={!deleting}
        withCloseButton={!deleting}
      >
        {affectedCounts &&
          (affectedCounts.active > 0 || affectedCounts.pending > 0) && (
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
                Role In Use
              </Text>
              {affectedCounts.active > 0 && (
                <Text size="sm" fs="italic" c="#2A2A2A">
                  This role is currently assigned to{" "}
                  <strong>
                    {affectedCounts.active} active user
                    {affectedCounts.active !== 1 ? "s" : ""}
                  </strong>
                  . Deleting it will remove it from all of them.
                </Text>
              )}
              {affectedCounts.pending > 0 && (
                <Text size="sm" fs="italic" c="#2A2A2A">
                  This role is assigned to{" "}
                  <strong>
                    {affectedCounts.pending} pending/invited user
                    {affectedCounts.pending !== 1 ? "s" : ""}
                  </strong>{" "}
                  awaiting activation. They will have no roles when they activate.
                </Text>
              )}
            </Alert>
          )}
        <Text size="sm" mb="md">
          Are you sure you want to delete <strong>{role.name}</strong>? This
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
          <Button
            variant="default"
            onClick={handleCloseDelete}
            disabled={deleting}
          >
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
