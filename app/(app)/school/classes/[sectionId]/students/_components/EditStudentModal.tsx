"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle } from "@tabler/icons-react";
import {
  checkLrnExists,
  updateStudent,
  type StudentRosterEntry,
} from "../../../_lib/classService";

interface Props {
  opened: boolean;
  student: StudentRosterEntry | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormValues {
  lrn: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  sex: "M" | "F";
}

function toTitleCase(str: string): string {
  return str
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const NAME_RE = /^[a-zA-Z][a-zA-Z']*(?:\s[a-zA-Z][a-zA-Z']*)*$/;

function nameValidator(label: string, required: boolean) {
  return (value: string) => {
    const t = value.trim();
    if (!t) return required ? `${label} is required.` : null;
    if (t.length < 2) return `${label} must be at least 2 characters.`;
    if (t.length > 100) return `${label} must be 100 characters or less.`;
    if (!NAME_RE.test(t))
      return `${label} must contain only letters and apostrophes (no numbers, symbols, or extra spaces).`;
    return null;
  };
}

function ErrorIcon({ message }: { message: string }) {
  return (
    <Tooltip label={message} position="top" withArrow>
      <ActionIcon variant="transparent" color="red" size="sm">
        <IconInfoCircle size={16} />
      </ActionIcon>
    </Tooltip>
  );
}

export default function EditStudentModal({
  opened,
  student,
  onClose,
  onSaved,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [checkingLrn, setCheckingLrn] = useState(false);

  const form = useForm<FormValues>({
    validateInputOnChange: true,
    initialValues: {
      lrn: "",
      last_name: "",
      first_name: "",
      middle_name: "",
      sex: "M",
    },
    validate: {
      lrn: (value) => {
        const t = value.trim();
        if (!t) return "LRN is required.";
        if (/\s/.test(t)) return "LRN cannot contain spaces.";
        if (!/^\d+$/.test(t)) return "LRN must contain numbers only.";
        if (t.length !== 12) return "LRN must be exactly 12 digits.";
        return null;
      },
      last_name: nameValidator("Last name", true),
      first_name: nameValidator("First name", true),
      middle_name: nameValidator("Middle name", false),
      sex: (value) => (!value ? "Sex is required." : null),
    },
  });

  // Seed form when modal opens with a student
  useEffect(() => {
    if (opened && student) {
      // full_name is "Last, First Middle" generated — parse back to fields
      // But we pass the raw fields via the roster entry; store them separately
      form.setValues({
        lrn: student.lrn,
        last_name: "", // populated below via parsed name
        first_name: "",
        middle_name: "",
        sex: student.sex,
      });
      form.resetDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, student]);

  // full_name from DB is a generated column — format depends on DB definition.
  // We don't have individual name fields on StudentRosterEntry, so we load them
  // from the students table directly via the form reset. Since the API doesn't
  // return individual name fields yet, we'll seed what we have and fetch the rest.
  // For now, disable lrn + sex pre-fill only (names require a separate fetch).
  // See: fetchStudentNames below.

  const [originalLrn, setOriginalLrn] = useState("");

  // Fetch individual name fields when modal opens
  useEffect(() => {
    if (!opened || !student) return;
    setOriginalLrn(student.lrn);
    void fetchStudentNames(student.lrn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, student]);

  async function fetchStudentNames(lrn: string) {
    try {
      // Re-use the public Supabase client for a simple select
      const { getSupabase } = await import("@/lib/supabase/client");
      const supabase = getSupabase();
      const { data } = await supabase
        .from("students")
        .select("last_name, first_name, middle_name, sex")
        .eq("lrn", lrn)
        .maybeSingle();

      if (data) {
        form.setValues({
          lrn,
          last_name: (data as any).last_name ?? "",
          first_name: (data as any).first_name ?? "",
          middle_name: (data as any).middle_name ?? "",
          sex: ((data as any).sex as "M" | "F") ?? "M",
        });
        form.resetDirty();
      }
    } catch {
      // If fetch fails, form fields stay empty — user can still fill them in
    }
  }

  const handleClose = () => {
    if (form.isDirty()) {
      modals.openConfirmModal({
        title: "Discard unsaved changes?",
        centered: true,
        children: (
          <Text size="sm">
            You have unsaved changes. Are you sure you want to close?
          </Text>
        ),
        labels: { confirm: "Discard", cancel: "Keep editing" },
        confirmProps: { color: "red" },
        onConfirm: () => {
          form.reset();
          onClose();
        },
      });
    } else {
      onClose();
    }
  };

  const handleSave = async () => {
    const { hasErrors } = form.validate();
    if (hasErrors) return;

    const newLrn = form.values.lrn.trim();
    const lrnChanged = newLrn !== originalLrn;

    // LRN uniqueness check (only if it changed)
    if (lrnChanged) {
      setCheckingLrn(true);
      try {
        const taken = await checkLrnExists(newLrn, originalLrn);
        if (taken) {
          form.setFieldError(
            "lrn",
            `LRN ${newLrn} is already assigned to another student.`,
          );
          return;
        }
      } catch {
        notifications.show({
          title: "Error",
          message: "Could not verify LRN. Please try again.",
          color: "red",
        });
        return;
      } finally {
        setCheckingLrn(false);
      }
    }

    modals.openConfirmModal({
      title: "Save changes?",
      centered: true,
      children: (
        <Text size="sm">
          Are you sure you want to update this student&apos;s information?
          {lrnChanged && (
            <>
              {" "}
              The LRN will change from <strong>{originalLrn}</strong> to{" "}
              <strong>{newLrn}</strong>.
            </>
          )}
        </Text>
      ),
      labels: { confirm: "Save", cancel: "Cancel" },
      confirmProps: { color: "#4EAE4A" },
      onConfirm: () => void submitForm(),
    });
  };

  const submitForm = async () => {
    setSaving(true);
    try {
      await updateStudent(originalLrn, {
        lrn: form.values.lrn.trim(),
        last_name: toTitleCase(form.values.last_name),
        first_name: toTitleCase(form.values.first_name),
        middle_name: form.values.middle_name.trim()
          ? toTitleCase(form.values.middle_name)
          : "",
        sex: form.values.sex,
      });
      notifications.show({
        title: "Saved",
        message: "Student information updated.",
        color: "green",
      });
      form.reset();
      onSaved();
      onClose();
    } catch (e) {
      notifications.show({
        title: "Error",
        message: e instanceof Error ? e.message : "Failed to update student.",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || checkingLrn;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Edit Student"
      centered
      size="md"
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      withCloseButton={!busy}
      overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
    >
      <Stack gap="md">
        {/* LRN */}
        <TextInput
          label="LRN"
          placeholder="12-digit Learner Reference Number"
          required
          maxLength={12}
          description="Exactly 12 numeric digits. No spaces or letters."
          {...form.getInputProps("lrn")}
          rightSection={
            form.errors.lrn ? (
              <ErrorIcon message={form.errors.lrn as string} />
            ) : null
          }
        />

        {/* Last Name */}
        <TextInput
          label="Last Name"
          placeholder="e.g. Dela Cruz"
          required
          maxLength={30}
          description={`${form.values.last_name.trim().length}/30 — letters only`}
          {...form.getInputProps("last_name")}
          rightSection={
            form.errors.last_name ? (
              <ErrorIcon message={form.errors.last_name as string} />
            ) : null
          }
        />

        {/* First Name */}
        <TextInput
          label="First Name"
          placeholder="e.g. Juan"
          required
          maxLength={30}
          description={`${form.values.first_name.trim().length}/30 — letters only`}
          {...form.getInputProps("first_name")}
          rightSection={
            form.errors.first_name ? (
              <ErrorIcon message={form.errors.first_name as string} />
            ) : null
          }
        />

        {/* Middle Name */}
        <TextInput
          label="Middle Name"
          placeholder="Optional"
          maxLength={30}
          description={`${form.values.middle_name.trim().length}/30 — optional, letters only`}
          {...form.getInputProps("middle_name")}
          rightSection={
            form.errors.middle_name ? (
              <ErrorIcon message={form.errors.middle_name as string} />
            ) : null
          }
        />

        {/* Sex */}
        <Select
          label="Sex"
          required
          data={[
            { value: "M", label: "Male" },
            { value: "F", label: "Female" },
          ]}
          {...form.getInputProps("sex")}
          allowDeselect={false}
        />

        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={handleClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => form.reset()}
            disabled={!form.isDirty() || busy}
          >
            Revert Changes
          </Button>
          <Button
            color="#4EAE4A"
            onClick={() => void handleSave()}
            loading={busy}
            disabled={!form.isDirty() || !form.isValid()}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
