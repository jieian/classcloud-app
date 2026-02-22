"use client";

import {
  Button,
  Group,
  Modal,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { createSchoolYear, DuplicateYearError, SchoolYear } from "../_lib/yearService";

interface CreateSchoolYearModalProps {
  opened: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingYears: SchoolYear[];
}

interface FormValues {
  start_year: string;
}

export default function CreateSchoolYearModal({
  opened,
  onClose,
  onSuccess,
  existingYears,
}: CreateSchoolYearModalProps) {
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValues>({
    validateInputOnChange: true,
    initialValues: {
      start_year: "",
    },
    validate: {
      start_year: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return "Start year is required";
        if (/\s/.test(value)) return "Start year cannot contain spaces";
        if (!/^\d+$/.test(trimmed))
          return "Start year must contain numbers only (no special characters)";
        if (trimmed.length !== 4)
          return "Start year must be exactly 4 digits";
        return null;
      },
    },
  });

  const endYearDisplay =
    form.values.start_year.trim() &&
    /^\d+$/.test(form.values.start_year.trim())
      ? (parseInt(form.values.start_year.trim(), 10) + 1).toString()
      : "";

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const handleSubmit = () => {
    const validation = form.validate();
    if (validation.hasErrors) return;

    const startYearNum = parseInt(form.values.start_year.trim(), 10);

    // Check for duplicate against already-loaded years
    const isDuplicate = existingYears.some(
      (sy) => sy.start_year === startYearNum,
    );
    if (isDuplicate) {
      form.setFieldError(
        "start_year",
        "A school year with this range already exists.",
      );
      return;
    }

    modals.openConfirmModal({
      title: "Create School Year?",
      children: (
        <Text size="sm">
          This will create school year{" "}
          <strong>
            {startYearNum}-{endYearDisplay}
          </strong>{" "}
          with 4 quarters. Everything will start as inactive.
        </Text>
      ),
      labels: { confirm: "Create", cancel: "Cancel" },
      confirmProps: { color: "green" },
      onConfirm: submitForm,
    });
  };

  const submitForm = async () => {
    try {
      setLoading(true);
      const startYearNum = parseInt(form.values.start_year.trim(), 10);
      const endYearNum = startYearNum + 1;

      await createSchoolYear(startYearNum, endYearNum);

      notifications.show({
        title: "Success",
        message: `School year ${startYearNum}-${endYearNum} created successfully.`,
        color: "green",
      });

      form.reset();
      onSuccess();
      onClose();
    } catch (error) {
      if (error instanceof DuplicateYearError) {
        form.setFieldError("start_year", error.message);
        notifications.show({
          title: "Duplicate School Year",
          message: error.message,
          color: "red",
        });
      } else {
        notifications.show({
          title: "Error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to create school year. Please try again.",
          color: "red",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Create School Year"
      centered
    >
      <Text size="sm" c="dimmed" mb="md">
        The school year and its quarters will start as inactive.
      </Text>

      <Group align="flex-start" mb="lg" gap="md">
        <TextInput
          label="Start Year"
          placeholder="e.g. 2025"
          maxLength={4}
          withErrorStyles
          {...form.getInputProps("start_year")}
          style={{ width: 180 }}
        />
        <TextInput
          label="End Year"
          value={endYearDisplay}
          disabled
          placeholder="Auto-filled"
          style={{ width: 180 }}
        />
      </Group>

      <Group justify="flex-end" mt="xl">
        <Button variant="default" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          color="green"
          onClick={handleSubmit}
          disabled={!form.isValid()}
          loading={loading}
        >
          Create
        </Button>
      </Group>
    </Modal>
  );
}
