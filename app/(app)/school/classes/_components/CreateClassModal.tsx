"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Collapse,
  Group,
  Modal,
  Radio,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconChevronDown, IconInfoCircle } from "@tabler/icons-react";
import type { GradeLevelRow } from "../_lib/classService";
import { createSection, checkSectionAvailability } from "../_lib/classService";

interface CreateClassModalProps {
  opened: boolean;
  onClose: () => void;
  onSuccess: () => void;
  gradeLevels: GradeLevelRow[];
  activeSyId: number | null;
}

function toTitleCase(str: string): string {
  return str
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CreateClassModal({
  opened,
  onClose,
  onSuccess,
  gradeLevels,
  activeSyId,
}: CreateClassModalProps) {
  const [gradeLevelsExpanded, setGradeLevelsExpanded] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm({
    initialValues: {
      name: "",
      grade_level_id: "",
      section_type: "REGULAR",
    },
    validate: {
      name: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return "Class name is required.";
        if (trimmed.length > 50)
          return "Class name must be 50 characters or less.";
        if (!/^[A-Za-z0-9]/.test(trimmed))
          return "Class name must start with a letter or number.";
        if (!/[A-Za-z0-9]$/.test(trimmed))
          return "Class name must end with a letter or number.";
        if (!/^[A-Za-z0-9\s\-]+$/.test(trimmed))
          return "Class name must not contain symbols.";
        if (/--/.test(trimmed))
          return "Class name cannot have consecutive hyphens.";
        return null;
      },
      grade_level_id: (value) =>
        !value ? "Please select a grade level." : null,
    },
  });

  useEffect(() => {
    if (opened) {
      form.reset();
      setGradeLevelsExpanded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  function applyTitleCase() {
    if (form.values.name.trim()) {
      form.setFieldValue("name", toTitleCase(form.values.name));
    }
  }

  async function handleSubmit() {
    const validation = form.validate();
    if (validation.hasErrors) return;

    const name = toTitleCase(form.values.name);
    const gradeLevelId = Number(form.values.grade_level_id);
    const sectionType = form.values.section_type as "REGULAR" | "SSES";

    setChecking(true);
    try {
      const check = await checkSectionAvailability({
        name,
        grade_level_id: gradeLevelId,
        section_type: sectionType,
      });

      if (!check.available) {
        if (check.conflict === "name") {
          form.setFieldError(
            "name",
            check.error ?? "This class name is already taken.",
          );
        }
        notifications.show({
          title:
            check.conflict === "name"
              ? "Class Name Taken"
              : "SSES Already Exists",
          message:
            check.error ?? "Validation failed. Please review your inputs.",
          color: "red",
        });
        return;
      }
    } catch {
      notifications.show({
        title: "Error",
        message: "Failed to validate class. Please try again.",
        color: "red",
      });
      return;
    } finally {
      setChecking(false);
    }

    const gradeLevelName =
      gradeLevels.find(
        (gl) => String(gl.grade_level_id) === form.values.grade_level_id,
      )?.display_name ?? "";
    const sectionTypeLabel = sectionType === "SSES" ? "SSES" : "Regular";

    modals.openConfirmModal({
      title: "Create Class?",
      centered: true,
      children: (
        <Text size="sm">
          This will create a <strong>{sectionTypeLabel}</strong> class named{" "}
          <strong>{name}</strong> under <strong>{gradeLevelName}</strong>.
        </Text>
      ),
      labels: { confirm: "Create", cancel: "Cancel" },
      confirmProps: { color: "#4EAE4A" },
      onConfirm: submitForm,
    });
  }

  async function submitForm() {
    setSubmitting(true);
    try {
      await createSection({
        name: toTitleCase(form.values.name),
        grade_level_id: Number(form.values.grade_level_id),
        section_type: form.values.section_type as "REGULAR" | "SSES",
      });

      notifications.show({
        title: "Class Created",
        message: `${toTitleCase(form.values.name)} has been created successfully.`,
        color: "green",
      });

      onSuccess();
      onClose();
    } catch (err) {
      notifications.show({
        title: "Error",
        message:
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.",
        color: "red",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = !activeSyId || checking || submitting;
  const hasGlError = !!form.errors.grade_level_id;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create a Class"
      size="md"
      centered
      overlayProps={{ backgroundOpacity: 0.5 }}
      closeOnClickOutside={!submitting}
      closeOnEscape={!submitting}
    >
      <Stack gap="md">
        {!activeSyId && (
          <Alert color="orange" icon={<IconInfoCircle size={16} />}>
            No active school year found. Please set an active school year before
            creating a class.
          </Alert>
        )}

        <TextInput
          label="Class Name"
          placeholder='e.g. "Sampaguita"'
          required
          maxLength={50}
          disabled={disabled}
          {...form.getInputProps("name")}
          onBlur={applyTitleCase}
          description={`${form.values.name.trim().length}/50 characters`}
        />

        <div>
          <Text size="sm" fw={500} mb={6}>
            Section Type{" "}
            <Text span c="red" fw={500}>
              *
            </Text>
          </Text>
          <Radio.Group
            value={form.values.section_type}
            onChange={(val) => form.setFieldValue("section_type", val)}
          >
            <Group gap="xl">
              <Radio
                value="SSES"
                label="SSES"
                disabled={disabled}
                color="blue"
              />
              <Radio
                value="REGULAR"
                label="Regular"
                disabled={disabled}
                color="gray"
              />
            </Group>
          </Radio.Group>
        </div>

        <div>
          <Box
            style={{
              border: `1px solid ${hasGlError ? "var(--mantine-color-red-6)" : "var(--mantine-color-default-border)"}`,
              borderRadius: "var(--mantine-radius-default)",
              overflow: "hidden",
            }}
          >
            <Group
              justify="space-between"
              align="center"
              onClick={() => !disabled && setGradeLevelsExpanded((v) => !v)}
              style={{
                cursor: disabled ? "not-allowed" : "pointer",
                userSelect: "none",
                padding: "8px 12px",
              }}
            >
              <Group gap={4}>
                <Text size="sm" fw={500}>
                  Grade Level
                </Text>
                <Text span size="sm" c="red" fw={500}>
                  *
                </Text>
                {form.values.grade_level_id && (
                  <Text span size="sm" c="dimmed">
                    (
                    {
                      gradeLevels.find(
                        (gl) =>
                          String(gl.grade_level_id) ===
                          form.values.grade_level_id,
                      )?.display_name
                    }
                    )
                  </Text>
                )}
              </Group>
              <IconChevronDown
                size={16}
                style={{
                  transition: "transform 200ms ease",
                  transform: gradeLevelsExpanded
                    ? "rotate(180deg)"
                    : "rotate(0deg)",
                }}
              />
            </Group>

            <Collapse in={gradeLevelsExpanded}>
              <Box
                p="sm"
                style={{
                  borderTop: "1px solid var(--mantine-color-default-border)",
                }}
              >
                {gradeLevels.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No grade levels found.
                  </Text>
                ) : (
                  <Radio.Group
                    value={form.values.grade_level_id}
                    onChange={(val) => {
                      form.setFieldValue("grade_level_id", val);
                    }}
                  >
                    <Stack gap="xs">
                      {gradeLevels.map((gl) => (
                        <Radio
                          key={gl.grade_level_id}
                          value={String(gl.grade_level_id)}
                          label={gl.display_name}
                          disabled={disabled}
                        />
                      ))}
                    </Stack>
                  </Radio.Group>
                )}
              </Box>
            </Collapse>
          </Box>
          {hasGlError && (
            <Text size="xs" c="red" mt={4}>
              {form.errors.grade_level_id}
            </Text>
          )}
        </div>

        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            color="#4EAE4A"
            loading={checking || submitting}
            disabled={!form.isValid() || !activeSyId}
            onClick={handleSubmit}
          >
            Create Class
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
