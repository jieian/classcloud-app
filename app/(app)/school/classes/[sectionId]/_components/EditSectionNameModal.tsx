"use client";

import { useEffect, useState } from "react";
import { Button, Group, Modal, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  checkSectionNameExists,
  renameSectionName,
} from "../../_lib/classService";

function toTitleCase(str: string): string {
  return str
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

interface Props {
  opened: boolean;
  sectionId: number;
  gradeLevelId: number;
  currentName: string;
  onClose: () => void;
  onRenamed: () => void;
}

export default function EditSectionNameModal({
  opened,
  sectionId,
  gradeLevelId,
  currentName,
  onClose,
  onRenamed,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  const form = useForm({
    initialValues: { name: currentName },
    validateInputOnChange: true,
    validate: {
      name: (v) => {
        const t = v.trim();
        if (!t) return "Class name cannot be empty.";
        if (!/^[a-zA-Z0-9\s]+$/.test(t))
          return "Only letters, numbers, and spaces are allowed.";
        return null;
      },
    },
  });

  useEffect(() => {
    if (opened) {
      form.setValues({ name: currentName });
      form.resetDirty({ name: currentName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, currentName]);

  const handleSave = async () => {
    const { hasErrors } = form.validate();
    if (hasErrors) return;

    const titled = toTitleCase(form.values.name);

    setChecking(true);
    try {
      const exists = await checkSectionNameExists(
        gradeLevelId,
        titled,
        sectionId,
      );
      if (exists) {
        form.setFieldError(
          "name",
          `A class named "${titled}" already exists in this grade level.`,
        );
        return;
      }
    } catch {
      notifications.show({
        title: "Error",
        message: "Could not verify class name. Please try again.",
        color: "red",
      });
      return;
    } finally {
      setChecking(false);
    }

    modals.openConfirmModal({
      title: "Rename Class?",
      centered: true,
      children: (
        <Text size="sm">
          Rename <strong>{currentName}</strong> to <strong>{titled}</strong>?
        </Text>
      ),
      labels: { confirm: "Rename", cancel: "Cancel" },
      confirmProps: { color: "#4EAE4A" },
      onConfirm: () => void submitRename(titled),
    });
  };

  const submitRename = async (name: string) => {
    setSaving(true);
    try {
      await renameSectionName(sectionId, name);
      notifications.show({
        title: "Success",
        message: `Class renamed to "${name}".`,
        color: "green",
      });
      onRenamed();
      onClose();
    } catch (e) {
      notifications.show({
        title: "Error",
        message: e instanceof Error ? e.message : "Failed to rename class.",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Rename Class"
      centered
      size="sm"
      overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
    >
      <TextInput
        label="Class Name"
        placeholder="e.g. Mabini"
        required
        description="Letters and numbers only. Will be saved in Title Case."
        mb="lg"
        {...form.getInputProps("name")}
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose} disabled={saving || checking}>
          Cancel
        </Button>
        <Button
          onClick={() => void handleSave()}
          loading={saving || checking}
          disabled={!form.isDirty() || !form.isValid()}
          color="#4EAE4A"
        >
          Save
        </Button>
      </Group>
    </Modal>
  );
}
