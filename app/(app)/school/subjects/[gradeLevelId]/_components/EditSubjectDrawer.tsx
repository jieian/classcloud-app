"use client";

import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Drawer,
  Grid,
  Group,
  Skeleton,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { getSupabase } from "@/lib/supabase/client";
import type { SubjectRow } from "../../_lib/subjectService";

interface EditSubjectDrawerProps {
  opened: boolean;
  onClose: () => void;
  subject: SubjectRow | null;
  onSuccess: () => void;
}

// Only letters, numbers, and spaces — no symbols
const NO_SYMBOLS_REGEX = /^[A-Za-z0-9 ]+$/;
// Letters, numbers, and spaces — no symbols (for subject code, e.g. "MATH 1")
const CODE_REGEX = /^[A-Za-z0-9 ]+$/;

interface GradeLevel {
  grade_level_id: number;
  level_number: number;
  display_name: string;
}

function toTitleCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function EditSubjectDrawer({
  opened,
  onClose,
  subject,
  onSuccess,
}: EditSubjectDrawerProps) {
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [selectedGradeLevels, setSelectedGradeLevels] = useState<string[]>([]);
  const [loadingGradeLevels, setLoadingGradeLevels] = useState(false);
  const [loading, setLoading] = useState(false);

  // Track initial grade levels to detect dirty state
  const initialGradeLevelIds = useRef<string[]>([]);

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
          return "Subject code must only contain letters, numbers, and spaces.";
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
    if (opened && subject) {
      form.setValues({
        code: subject.code,
        name: subject.name,
        description: subject.description ?? "",
      });
      form.resetDirty({
        code: subject.code,
        name: subject.name,
        description: subject.description ?? "",
      });
      loadGradeLevels(subject.subject_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, subject]);

  async function loadGradeLevels(subjectId: number) {
    try {
      setLoadingGradeLevels(true);
      const supabase = getSupabase();

      const [{ data: allLevels, error: glError }, { data: linked, error: linkError }] =
        await Promise.all([
          supabase
            .from("grade_levels")
            .select("grade_level_id, level_number, display_name")
            .order("level_number"),
          supabase
            .from("subject_grade_levels")
            .select("grade_level_id")
            .eq("subject_id", subjectId)
            .is("deleted_at", null),
        ]);

      if (glError) throw glError;
      if (linkError) throw linkError;

      setGradeLevels(allLevels ?? []);

      const ids = (linked ?? []).map((r) => String(r.grade_level_id));
      setSelectedGradeLevels(ids);
      initialGradeLevelIds.current = ids;
    } catch (err) {
      console.error("Failed to load grade levels:", err);
    } finally {
      setLoadingGradeLevels(false);
    }
  }

  const gradeLevelsDirty =
    JSON.stringify([...selectedGradeLevels].sort()) !==
    JSON.stringify([...initialGradeLevelIds.current].sort());

  const isAnythingDirty = form.isDirty() || gradeLevelsDirty;

  function handleClose() {
    if (isAnythingDirty) {
      modals.openConfirmModal({
        title: "Discard unsaved changes?",
        centered: true,
        children: (
          <Text size="sm">
            You have unsaved changes. Are you sure you want to close this drawer?
          </Text>
        ),
        labels: { confirm: "Discard", cancel: "Cancel" },
        confirmProps: { color: "red" },
        onConfirm: () => {
          form.reset();
          onClose();
        },
      });
    } else {
      onClose();
    }
  }

  function handleRevert() {
    if (!subject) return;
    form.setValues({
      code: subject.code,
      name: subject.name,
      description: subject.description ?? "",
    });
    form.resetDirty({
      code: subject.code,
      name: subject.name,
      description: subject.description ?? "",
    });
    setSelectedGradeLevels([...initialGradeLevelIds.current]);
  }

  function handleSave() {
    const validation = form.validate();
    if (validation.hasErrors) {
      notifications.show({
        title: "Validation Error",
        message: "Please fix all errors before saving.",
        color: "red",
      });
      return;
    }

    modals.openConfirmModal({
      title: "Save changes?",
      centered: true,
      children: (
        <Text size="sm">
          Are you sure you want to update{" "}
          <strong>{toTitleCase(form.values.name)}</strong>? Changes cannot be
          reverted.
        </Text>
      ),
      labels: { confirm: "Save", cancel: "Cancel" },
      confirmProps: { color: "#4EAE4A" },
      onConfirm: submitForm,
    });
  }

  async function submitForm() {
    if (!subject) return;
    setLoading(true);

    try {
      const res = await fetch("/api/subjects/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_id: subject.subject_id,
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
        title: "Subject Updated",
        message: `${toTitleCase(form.values.name)} has been updated successfully.`,
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
      setLoading(false);
    }
  }

  return (
    <Drawer
      opened={opened}
      onClose={handleClose}
      title="Edit Subject"
      position="bottom"
      size="lg"
      overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
    >
      <Grid gutter="lg">
        {/* Column I: Subject Details */}
        <Grid.Col span={7}>
          <Text size="sm" fw={600} mb="md">
            Subject Details
          </Text>

          <TextInput
            label="Subject Code"
            placeholder="e.g. MATH 1"
            required
            mb="md"
            {...form.getInputProps("code")}
          />

          <TextInput
            label="Name"
            placeholder="e.g. Mathematics"
            required
            mb="md"
            {...form.getInputProps("name")}
            onBlur={() => {
              const v = form.values.name;
              if (v.trim()) form.setFieldValue("name", toTitleCase(v));
            }}
          />

          <Textarea
            label="Description"
            placeholder="Briefly describe the subject"
            required
            autosize
            minRows={3}
            {...form.getInputProps("description")}
          />
        </Grid.Col>

        {/* Column II: Grade Levels */}
        <Grid.Col span={5}>
          <Text size="sm" fw={600} mb="md">
            Grade Levels
          </Text>

          {loadingGradeLevels ? (
            <Stack gap="xs">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} height={24} radius="sm" />
              ))}
            </Stack>
          ) : gradeLevels.length === 0 ? (
            <Text size="sm" c="dimmed">
              No grade levels found.
            </Text>
          ) : (
            <Box
              style={{
                border: "1px solid var(--mantine-color-default-border)",
                borderRadius: "var(--mantine-radius-default)",
                padding: "var(--mantine-spacing-sm)",
              }}
            >
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
            </Box>
          )}
        </Grid.Col>
      </Grid>

      {/* Action Buttons */}
      <Group justify="flex-end" mt="xl">
        <Button variant="default" onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="outline"
          onClick={handleRevert}
          disabled={!isAnythingDirty || loading}
        >
          Revert Changes
        </Button>
        <Button
          color="#4EAE4A"
          onClick={handleSave}
          disabled={!isAnythingDirty || !form.isValid()}
          loading={loading}
        >
          Save Changes
        </Button>
      </Group>
    </Drawer>
  );
}
