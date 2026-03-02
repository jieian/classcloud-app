"use client";

import { useState } from "react";
import { Button, Group, Modal, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { archiveSection } from "../../_lib/classService";

interface Props {
  opened: boolean;
  sectionId: number;
  sectionName: string;
  onClose: () => void;
  onArchived: () => void;
}

export default function ArchiveClassModal({
  opened,
  sectionId,
  sectionName,
  onClose,
  onArchived,
}: Props) {
  const [confirmText, setConfirmText] = useState("");
  const [archiving, setArchiving] = useState(false);

  const handleClose = () => {
    setConfirmText("");
    onClose();
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await archiveSection(sectionId);
      notifications.show({
        title: "Class Deleted",
        message: `${sectionName} has been deleted.`,
        color: "orange",
      });
      onArchived();
    } catch (e) {
      notifications.show({
        title: "Error",
        message: e instanceof Error ? e.message : "Failed to delete class.",
        color: "red",
      });
    } finally {
      setArchiving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Delete Class"
      centered
      closeOnClickOutside={!archiving}
      closeOnEscape={!archiving}
      withCloseButton={!archiving}
    >
      <Text size="sm" mb="md">
        Are you sure you want to delete <strong>{sectionName}</strong>? The
        class will no longer appear in the active classes list.
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
        disabled={archiving}
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={handleClose} disabled={archiving}>
          Cancel
        </Button>
        <Button
          color="red"
          disabled={confirmText.toLowerCase() !== "delete"}
          loading={archiving}
          onClick={() => void handleArchive()}
        >
          Delete
        </Button>
      </Group>
    </Modal>
  );
}
