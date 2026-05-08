"use client";

import { useEffect } from "react";
import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import type { WizardSection } from "../_lib/types";

interface AddClassModalProps {
  opened: boolean;
  onClose: () => void;
  grade_level_id: number;
  gradeDisplayName: string;
  existingSections: WizardSection[];
  /** Pass existing section to pre-fill for edit mode; null for add mode. */
  editSection?: WizardSection | null;
  onAddSection: (section: { name: string; section_type: "SSES" | "REGULAR" }) => void;
}

function toTitleCase(str: string): string {
  return str
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function validateName(
  value: string,
  grade_level_id: number,
  existingSections: WizardSection[],
  editTempId?: string
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Class name is required.";
  if (trimmed.length > 50) return "Class name must be 50 characters or less.";
  if (!/^[A-Za-z0-9]/.test(trimmed))
    return "Class name must start with a letter or number.";
  if (!/[A-Za-z0-9]$/.test(trimmed))
    return "Class name must end with a letter or number.";
  if (!/^[A-Za-z0-9\s\-]+$/.test(trimmed))
    return "Class name must not contain symbols.";
  if (/--/.test(trimmed)) return "Class name cannot have consecutive hyphens.";

  // Case-insensitive uniqueness within same grade level (excluding self in edit mode)
  const normalized = trimmed.toLowerCase();
  const duplicate = existingSections.some(
    (s) =>
      s.grade_level_id === grade_level_id &&
      s.name.toLowerCase().trim() === normalized &&
      s.tempId !== editTempId
  );
  if (duplicate) return "A class with this name already exists in this grade level.";

  return null;
}

function EnterToConfirm({ onEnter }: { onEnter: () => void }) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Enter") onEnter();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function AddClassModal({
  opened,
  onClose,
  grade_level_id,
  gradeDisplayName,
  existingSections,
  editSection,
  onAddSection,
}: AddClassModalProps) {
  const isEdit = editSection != null;
  const isMobile = useMediaQuery("(max-width: 768px)");
  const confirmModalProps = isMobile
    ? {
        styles: {
          inner: { alignItems: "flex-end", paddingBottom: "20px" },
          content: { width: "100%", maxWidth: "100%", borderRadius: "12px 12px 0 0" },
        },
      }
    : {};

  const form = useForm({
    initialValues: {
      name: editSection?.name ?? "",
    },
    validate: {
      name: (value) =>
        validateName(value, grade_level_id, existingSections, editSection?.tempId),
    },
    validateInputOnChange: true,
  });

  useEffect(() => {
    if (opened) {
      form.setValues({ name: editSection?.name ?? "" });
      form.clearErrors();
    }
  }, [opened, editSection]);

  function applyTitleCase() {
    if (form.values.name.trim()) {
      form.setFieldValue("name", toTitleCase(form.values.name));
    }
  }

  function handleSubmit() {
    const validation = form.validate();
    if (validation.hasErrors) return;

    const name = toTitleCase(form.values.name);

    if (isEdit) {
      onAddSection({ name, section_type: "REGULAR" });
      onClose();
      return;
    }

    let confirmId!: string;
    confirmId = modals.openConfirmModal({
      title: "Add Class?",
      children: (
        <>
          <EnterToConfirm
            onEnter={() => {
              onAddSection({ name, section_type: "REGULAR" });
              onClose();
              modals.close(confirmId);
            }}
          />
          <Text size="sm">
            Add a regular class named &quot;{name}&quot; under {gradeDisplayName}?
          </Text>
        </>
      ),
      labels: { confirm: "Add", cancel: "Cancel" },
      confirmProps: { color: "#4EAE4A" },
      onConfirm: () => {
        onAddSection({ name, section_type: "REGULAR" });
        onClose();
      },
      ...confirmModalProps,
    });
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? "Edit Class" : "Add a Class"}
      size="md"
      centered
      overlayProps={{ backgroundOpacity: 0.5 }}
    >
      <Stack gap="md">
        <TextInput
          data-autofocus
          label="Class Name"
          placeholder='e.g. "Sampaguita"'
          required
          maxLength={50}
          {...form.getInputProps("name")}
          onBlur={applyTitleCase}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          description={`${form.values.name.trim().length}/50 characters`}
        />

        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            color="#4EAE4A"
            disabled={!form.isValid()}
            onClick={handleSubmit}
          >
            {isEdit ? "Save Changes" : "Add Class"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
