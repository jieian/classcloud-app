"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Collapse,
  Group,
  Modal,
  Skeleton,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconChevronDown } from "@tabler/icons-react";
import { getSupabase } from "@/lib/supabase/client";

interface GradeLevel {
  grade_level_id: number;
  level_number: number;
  display_name: string;
}

interface CreateSubjectModalProps {
  opened: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedGradeLevelId?: number;
}

// Only letters, numbers, and spaces — no symbols
const NO_SYMBOLS_REGEX = /^[A-Za-z0-9 ]+$/;
// Letters, numbers, and spaces — no symbols (for subject code, e.g. "MATH 1")
const CODE_REGEX = /^[A-Za-z0-9 ]+$/;

function toTitleCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CreateSubjectModal({
  opened,
  onClose,
  onSuccess,
  preselectedGradeLevelId,
}: CreateSubjectModalProps) {
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [gradeLevelsExpanded, setGradeLevelsExpanded] = useState(false);
  const [selectedGradeLevels, setSelectedGradeLevels] = useState<string[]>([]);
  const [loadingGradeLevels, setLoadingGradeLevels] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkingCode, setCheckingCode] = useState(false);

  const form = useForm({
    initialValues: {
      code: "",
      name: "",
      description: "",
    },
    validate: {
      code: (value) => {
        if (!value.trim()) return "Subject code is required.";
        if (!CODE_REGEX.test(value.trim()))
          return "Subject code must only contain letters and numbers (no spaces or symbols).";
        return null;
      },
      name: (value) => {
        if (!value.trim()) return "Name is required.";
        if (!NO_SYMBOLS_REGEX.test(value.trim()))
          return "Name must not contain symbols.";
        return null;
      },
      description: (value) => {
        if (!value.trim()) return "Description is required.";
        if (!NO_SYMBOLS_REGEX.test(value.trim()))
          return "Description must not contain symbols.";
        return null;
      },
    },
  });

  useEffect(() => {
    if (opened) {
      form.reset();
      setSelectedGradeLevels(
        preselectedGradeLevelId ? [String(preselectedGradeLevelId)] : [],
      );
      setGradeLevelsExpanded(false);
      loadGradeLevels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, preselectedGradeLevelId]);

  async function loadGradeLevels() {
    try {
      setLoadingGradeLevels(true);
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("grade_levels")
        .select("grade_level_id, level_number, display_name")
        .order("level_number");
      if (error) throw error;
      setGradeLevels(data ?? []);
    } catch (err) {
      console.error("Failed to load grade levels:", err);
    } finally {
      setLoadingGradeLevels(false);
    }
  }

  function applyTitleCase(field: "code" | "name") {
    const value = form.values[field];
    if (value.trim()) {
      form.setFieldValue(field, toTitleCase(value));
    }
  }

  async function validateCodeAvailability(code: string) {
    const res = await fetch("/api/subjects/check-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (res.ok) return true;

    const data = await res.json();
    if (res.status === 409) {
      const error = data.error ?? "A subject with this code already exists.";
      form.setFieldError("code", error);
      notifications.show({
        title: "Duplicate Subject Code",
        message: error,
        color: "red",
      });
      return false;
    }

    notifications.show({
      title: "Error",
      message: data.error ?? "Failed to validate subject code. Please try again.",
      color: "red",
    });
    return false;
  }

  async function handleSubmit() {
    const validation = form.validate();
    if (validation.hasErrors) return;

    const code = form.values.code.trim();
    const name = toTitleCase(form.values.name);
    const selectedNames = gradeLevels
      .filter((gl) => selectedGradeLevels.includes(String(gl.grade_level_id)))
      .map((gl) => gl.display_name)
      .join(", ");

    setCheckingCode(true);
    const isCodeAvailable = await validateCodeAvailability(code);
    setCheckingCode(false);

    if (!isCodeAvailable) return;

    modals.openConfirmModal({
      title: "Create Subject?",
      centered: true,
      children: (
        <Text size="sm">
          This will create subject <strong>{name}</strong> with code{" "}
          <strong>{code}</strong>, linked to: <strong>{selectedNames}</strong>.
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
      const res = await fetch("/api/subjects/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.values.code.trim(),
          name: toTitleCase(form.values.name),
          description: form.values.description.trim(),
          grade_level_ids: selectedGradeLevels.map(Number),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          form.setFieldError("code", data.error);
          notifications.show({
            title: "Duplicate Subject Code",
            message: data.error,
            color: "red",
          });
        } else {
          notifications.show({
            title: "Error",
            message: data.error ?? "Something went wrong. Please try again.",
            color: "red",
          });
        }
        return;
      }

      notifications.show({
        title: "Subject Created",
        message: `${toTitleCase(form.values.name)} has been created successfully.`,
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
      setSubmitting(false);
    }
  }

  const isFormReady =
    form.isValid() && selectedGradeLevels.length > 0 && !submitting && !checkingCode;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create Subject"
      size="md"
      centered
      overlayProps={{ backgroundOpacity: 0.5 }}
      closeOnClickOutside={!submitting}
      closeOnEscape={!submitting}
    >
      <Stack gap="md">
        <TextInput
          label="Subject Code"
          placeholder="e.g. Math11"
          required
          {...form.getInputProps("code")}
        />

        <TextInput
          label="Name"
          placeholder="e.g. Mathematics"
          required
          {...form.getInputProps("name")}
          onBlur={() => applyTitleCase("name")}
        />

        <Textarea
          label="Description"
          placeholder="Briefly describe the subject"
          required
          autosize
          minRows={3}
          {...form.getInputProps("description")}
        />

        <Box
          style={{
            border: "1px solid var(--mantine-color-default-border)",
            borderRadius: "var(--mantine-radius-default)",
            overflow: "hidden",
          }}
        >
          <Group
            justify="space-between"
            align="center"
            onClick={() => setGradeLevelsExpanded((v) => !v)}
            style={{ cursor: "pointer", userSelect: "none", padding: "8px 12px" }}
          >
            <Group gap={4}>
              <Text size="sm" fw={500}>
                Grade Levels
              </Text>
              <Text size="sm" c="red" fw={500}>
                *
              </Text>
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
              {loadingGradeLevels ? (
                <Stack gap="xs">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} height={22} radius="sm" />
                  ))}
                </Stack>
              ) : gradeLevels.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No grade levels found.
                </Text>
              ) : (
                <Checkbox.Group
                  value={selectedGradeLevels}
                  onChange={setSelectedGradeLevels}
                >
                  <Stack gap="xs">
                    {gradeLevels.map((gl) => (
                      <Checkbox
                        key={gl.grade_level_id}
                        value={String(gl.grade_level_id)}
                        label={gl.display_name}
                      />
                    ))}
                  </Stack>
                </Checkbox.Group>
              )}
            </Box>
          </Collapse>
        </Box>

        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            color="#4EAE4A"
            loading={submitting || checkingCode}
            disabled={!isFormReady}
            onClick={handleSubmit}
          >
            Create Subject
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
