"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Text,
  TextInput,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import type { SubjectRow } from "../../_lib/subjectService";

interface DeleteSubjectModalProps {
  opened: boolean;
  onClose: () => void;
  subject: SubjectRow | null;
  onSuccess: () => void;
}

export default function DeleteSubjectModal({
  opened,
  onClose,
  subject,
  onSuccess,
}: DeleteSubjectModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const isAssigned = (subject?.teachers?.length ?? 0) > 0;

  useEffect(() => {
    if (opened) {
      setConfirmText("");
      setDeleting(false);
    }
  }, [opened]);

  async function handleDelete() {
    if (!subject) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/subjects/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_id: subject.subject_id }),
      });
      const data = await res.json();

      if (!res.ok) {
        notifications.show({
          title: "Error",
          message: data.error ?? "Something went wrong. Please try again.",
          color: "red",
        });
        return;
      }

      notifications.show({
        title: "Subject Deleted",
        message: `${subject.name} has been deleted successfully.`,
        color: "green",
      });
      onSuccess();
      onClose();
    } catch {
      notifications.show({
        title: "Error",
        message: "Network error. Please try again.",
        color: "red",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Delete Subject"
      centered
      closeOnClickOutside={!deleting}
      closeOnEscape={!deleting}
      withCloseButton={!deleting}
    >
      {isAssigned && (
        <Alert icon={<IconAlertTriangle size={16} />} color="orange" mb="md">
          This subject is currently assigned to{" "}
          <strong>{subject?.teachers[0]}</strong>. Deleting it will remove it
          from their academic load.
        </Alert>
      )}
      <Text size="sm" mb="md">
        Are you sure you want to delete <strong>{subject?.code}</strong>? This
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
        <Button variant="default" onClick={onClose} disabled={deleting}>
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
  );
}
