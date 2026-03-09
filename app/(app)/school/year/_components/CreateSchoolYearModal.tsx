"use client";

import { Button, Group, Modal, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import {
  createSchoolYear,
  DuplicateYearError,
  SchoolYear,
} from "../_lib/yearService";

interface CreateSchoolYearModalProps {
  opened: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingYears: SchoolYear[];
}

export default function CreateSchoolYearModal({
  opened,
  onClose,
  onSuccess,
  existingYears,
}: CreateSchoolYearModalProps) {
  const [loading, setLoading] = useState(false);

  const latestYear = existingYears.reduce<SchoolYear | null>(
    (max, sy) => (max === null || sy.start_year > max.start_year ? sy : max),
    null,
  );

  const hasExisting = latestYear !== null;
  const nextStart = hasExisting ? latestYear!.start_year + 1 : null;
  const nextEnd = nextStart !== null ? nextStart + 1 : null;
  const nextRange = nextStart !== null ? `${nextStart}-${nextEnd}` : null;

  // Form is only used when there are no existing years
  const form = useForm({
    validateInputOnChange: true,
    initialValues: { start_year: "" },
    validate: {
      start_year: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return "Start year is required";
        if (/\s/.test(value)) return "Start year cannot contain spaces";
        if (!/^\d+$/.test(trimmed))
          return "Start year must contain numbers only";
        if (trimmed.length !== 4) return "Start year must be exactly 4 digits";
        return null;
      },
    },
  });

  const manualEndYear =
    form.values.start_year.trim() && /^\d+$/.test(form.values.start_year.trim())
      ? (parseInt(form.values.start_year.trim(), 10) + 1).toString()
      : "";

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const submit = async (startYear: number, endYear: number) => {
    const range = `${startYear}-${endYear}`;
    try {
      setLoading(true);
      await createSchoolYear(startYear, endYear);
      notifications.show({
        title: "Success",
        message: `School year ${range} created successfully.`,
        color: "green",
      });
      form.reset();
      onSuccess();
      onClose();
    } catch (error) {
      if (error instanceof DuplicateYearError) {
        if (!hasExisting) form.setFieldError("start_year", error.message);
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

  const handleConfirm = () => {
    if (nextStart !== null && nextEnd !== null) {
      submit(nextStart, nextEnd);
    }
  };

  const handleManualSubmit = () => {
    const validation = form.validate();
    if (validation.hasErrors) return;
    const startYear = parseInt(form.values.start_year.trim(), 10);
    submit(startYear, startYear + 1);
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Create School Year"
      centered
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      withCloseButton={!loading}
    >
      {hasExisting ? (
        // Auto-derive from latest — simple confirmation
        <Text size="sm" mb="xl">
          This will create school year <strong>{nextRange}</strong> with 3
          terms. Everything will start as inactive.
        </Text>
      ) : (
        // No existing years — manual form
        <>
          <Text size="sm" c="dimmed" mb="md">
            The school year and its terms will start as inactive.
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
              value={manualEndYear}
              disabled
              placeholder="Auto-filled"
              style={{ width: 180 }}
            />
          </Group>
        </>
      )}

      <Group justify="flex-end">
        <Button variant="default" onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          color="green"
          onClick={hasExisting ? handleConfirm : handleManualSubmit}
          loading={loading}
          disabled={!hasExisting && !form.isValid()}
        >
          Create
        </Button>
      </Group>
    </Modal>
  );
}
