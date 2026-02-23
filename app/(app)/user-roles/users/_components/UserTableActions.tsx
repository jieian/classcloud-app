"use client";

import { useState, useEffect } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { getSupabase } from "@/lib/supabase/client";
import type { UserWithRoles } from "../_lib";
import { deleteUser } from "../_lib";
import EditUserDrawer from "./EditUserDrawer";

interface UserTableActionsProps {
  user: UserWithRoles;
  onUpdate: () => void;
}

export default function UserTableActions({
  user,
  onUpdate,
}: UserTableActionsProps) {
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] =
    useDisclosure(false);
  const [deleteOpened, { open: openDelete, close: closeDelete }] =
    useDisclosure(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [currentUid, setCurrentUid] = useState<string | null>(null);

  useEffect(() => {
    const fetchUid = async () => {
      const { data } = await getSupabase().auth.getUser();
      setCurrentUid(data.user?.id ?? null);
    };
    fetchUid();
  }, []);

  const isSelf = currentUid === user.uid;

  const fullName = `${user.first_name} ${user.last_name}`;

  const handleSuccess = () => {
    onUpdate();
  };

  const handleCloseDelete = () => {
    setConfirmText("");
    closeDelete();
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      await deleteUser(user.uid);
      handleCloseDelete();
      onUpdate();
    } catch (err) {
      console.error("Failed to delete user:", err);
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
            onClick={openDrawer}
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
              onClick={openDelete}
              disabled={isSelf}
            >
              <IconTrash size={16} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        </Tooltip>
      </Group>

      <EditUserDrawer
        opened={drawerOpened}
        onClose={closeDrawer}
        user={user}
        onSuccess={handleSuccess}
      />

      <Modal
        opened={deleteOpened}
        onClose={handleCloseDelete}
        title="Delete User"
        centered
      >
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
