"use client";

import {
  Button,
  Divider,
  Drawer,
  Group,
  Modal,
  Skeleton,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect, useRef, useState } from "react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import type { Quarter, SchoolYear } from "../_lib/yearService";
import {
  deleteSchoolYear,
  DuplicateYearError,
  getQuartersByYear,
  updateSchoolYear,
} from "../_lib/yearService";

interface EditSchoolYearDrawerProps {
  opened: boolean;
  onClose: () => void;
  onSuccess: () => void;
  schoolYear: SchoolYear;
  isOnlyActiveYear: boolean;
}

interface FormValues {
  start_year: string;
  is_active: boolean;
}

export default function EditSchoolYearDrawer({
  opened,
  onClose,
  onSuccess,
  schoolYear,
  isOnlyActiveYear,
}: EditSchoolYearDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [loadingQuarters, setLoadingQuarters] = useState(false);
  const [quarters, setQuarters] = useState<Quarter[]>([]);
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const openedValuesRef = useRef<FormValues>({
    start_year: "",
    is_active: false,
  });
  const openedQuartersRef = useRef<Quarter[]>([]);

  const form = useForm<FormValues>({
    validateInputOnChange: true,
    initialValues: {
      start_year: schoolYear.start_year.toString(),
      is_active: schoolYear.is_active,
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

  useEffect(() => {
    if (opened) {
      const vals: FormValues = {
        start_year: schoolYear.start_year.toString(),
        is_active: schoolYear.is_active,
      };
      openedValuesRef.current = vals;
      form.setValues(vals);
      form.resetDirty(vals);
      loadQuarters();
    }
  }, [opened, schoolYear]);

  // Warn on browser/tab close when there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isAnyDirty && opened) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [opened]);

  async function loadQuarters() {
    try {
      setLoadingQuarters(true);
      const data = await getQuartersByYear(schoolYear.sy_id);
      openedQuartersRef.current = data.map((q) => ({ ...q }));
      setQuarters(data);
    } catch (error) {
      notifications.show({
        title: "Error Loading Quarters",
        message:
          error instanceof Error
            ? error.message
            : "Failed to load quarters. Please try again.",
        color: "red",
        autoClose: 10000,
      });
    } finally {
      setLoadingQuarters(false);
    }
  }

  const quartersChanged = quarters.some(
    (q, i) => q.is_active !== openedQuartersRef.current[i]?.is_active,
  );
  const isAnyDirty = form.isDirty() || quartersChanged;

  const inactivateAllQuarters = () => {
    setQuarters((prev) => prev.map((q) => ({ ...q, is_active: false })));
  };

  // ----- School Year Status Toggle -----
  const handleToggleYearStatus = (newStatus: boolean) => {
    if (!newStatus) {
      // Deactivating: always inactivate all quarters too
      if (isOnlyActiveYear) {
        modals.openConfirmModal({
          title: "Warning: No active school year",
          children: (
            <Text size="sm">
              After this change, there will be no active school year. Do you
              want to proceed?
            </Text>
          ),
          labels: { confirm: "Proceed", cancel: "Cancel" },
          confirmProps: { color: "orange" },
          onConfirm: () => {
            form.setFieldValue("is_active", false);
            inactivateAllQuarters();
          },
        });
      } else {
        form.setFieldValue("is_active", false);
        inactivateAllQuarters();
      }
    } else {
      form.setFieldValue("is_active", true);
    }
  };

  // ----- Quarter Status Toggle -----
  const handleToggleQuarter = (quarter_id: number) => {
    const quarter = quarters.find((q) => q.quarter_id === quarter_id);
    if (!quarter) return;

    if (quarter.is_active) {
      const activeCount = quarters.filter((q) => q.is_active).length;
      if (activeCount === 1) {
        modals.openConfirmModal({
          title: "Warning: No active quarter",
          children: (
            <Text size="sm">
              After this change, there will be no active quarter. Do you want to
              proceed?
            </Text>
          ),
          labels: { confirm: "Proceed", cancel: "Cancel" },
          confirmProps: { color: "orange" },
          onConfirm: () =>
            setQuarters((prev) =>
              prev.map((q) =>
                q.quarter_id === quarter_id ? { ...q, is_active: false } : q,
              ),
            ),
        });
      } else {
        setQuarters((prev) =>
          prev.map((q) =>
            q.quarter_id === quarter_id ? { ...q, is_active: false } : q,
          ),
        );
      }
    } else {
      // Only 1 active quarter at a time — deactivate all others
      setQuarters((prev) =>
        prev.map((q) => ({ ...q, is_active: q.quarter_id === quarter_id })),
      );
      // Activating a quarter implicitly activates the school year too
      form.setFieldValue("is_active", true);
    }
  };

  // ----- Delete -----
  const handleDelete = () => {
    setConfirmText("");
    setDeleteModalOpened(true);
  };

  const handleConfirmDelete = async () => {
    try {
      setDeleting(true);
      await deleteSchoolYear(schoolYear.sy_id);
      notifications.show({
        title: "Deleted",
        message: `School year ${schoolYear.year_range} has been deleted.`,
        color: "green",
      });
      setDeleteModalOpened(false);
      onSuccess();
      onClose();
    } catch (error) {
      notifications.show({
        title: "Error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to delete school year. Please try again.",
        color: "red",
      });
    } finally {
      setDeleting(false);
    }
  };

  // ----- Cancel / Close -----
  const handleClose = () => {
    if (isAnyDirty) {
      modals.openConfirmModal({
        title: "Discard unsaved changes?",
        children: (
          <Text size="sm">
            You have unsaved changes. Are you sure you want to close this
            drawer?
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
  };

  // ----- Revert Changes -----
  const handleRevert = () => {
    form.setValues(openedValuesRef.current);
    form.resetDirty(openedValuesRef.current);
    setQuarters(openedQuartersRef.current.map((q) => ({ ...q })));
  };

  // ----- Save -----
  const handleSave = () => {
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
      title: "Confirm updates?",
      children: (
        <Text size="sm">
          Are you sure you want to save these changes to the school year?
        </Text>
      ),
      labels: { confirm: "Confirm", cancel: "Cancel" },
      confirmProps: { color: "blue" },
      onConfirm: async () => {
        await submitForm();
      },
    });
  };

  const submitForm = async () => {
    try {
      setLoading(true);

      const startYearNum = parseInt(form.values.start_year.trim(), 10);
      const endYearNum = startYearNum + 1;

      // Uniqueness check + all updates happen atomically inside the RPC
      await updateSchoolYear(
        schoolYear.sy_id,
        startYearNum,
        endYearNum,
        form.values.is_active,
        quarters.map((q) => ({
          quarter_id: q.quarter_id,
          is_active: q.is_active,
        })),
      );

      notifications.show({
        title: "Success",
        message: "School year updated successfully.",
        color: "green",
      });

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
              : "Failed to update school year. Please try again.",
          color: "red",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Derived end year shown in the disabled input
  const endYearDisplay =
    form.values.start_year.trim() && /^\d+$/.test(form.values.start_year.trim())
      ? (parseInt(form.values.start_year.trim(), 10) + 1).toString()
      : "";

  return (
    <Drawer
      opened={opened}
      onClose={handleClose}
      title="Manage School Year"
      position="bottom"
      size="lg"
      overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
    >
      <form>
        <Group justify="space-between" align="center" mb="md">
          <Text size="sm" fw={600}>
            School Year Details
          </Text>

          <Group gap="xs">
            <Text size="sm" fw={600}>
              Status:
            </Text>
            <Switch
              checked={form.values.is_active}
              onChange={(e) => handleToggleYearStatus(e.currentTarget.checked)}
              color="green"
              size="xl"
              onLabel="Active"
              offLabel="Inactive"
            />
          </Group>
        </Group>
        {/* Form Inputs Section */}
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

        <Divider mb="lg" />
        {/* Quarters */}
        <Text size="sm" fw={600} mb="md">
          Quarter
        </Text>
        {loadingQuarters ? (
          <>
            <Skeleton height={40} mb="sm" />
            <Skeleton height={40} mb="sm" />
            <Skeleton height={40} mb="sm" />
            <Skeleton height={40} mb="sm" />
          </>
        ) : quarters.length === 0 ? (
          <Text size="sm" c="dimmed">
            No quarters found for this school year.
          </Text>
        ) : (
          <Table withRowBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Quarter Name</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {quarters.map((quarter) => (
                <Table.Tr key={quarter.quarter_id}>
                  <Table.Td>{quarter.name}</Table.Td>
                  <Table.Td>
                    <Switch
                      checked={quarter.is_active}
                      onChange={() => handleToggleQuarter(quarter.quarter_id)}
                      color="green"
                      size="xl"
                      onLabel="Active"
                      offLabel="Inactive"
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
        {/* Action Buttons */}
        <Group justify="space-between" mt="xl">
          <Button
            color="red"
            variant="outline"
            onClick={handleDelete}
            loading={loading}
          >
            Delete School Year
          </Button>
          <Group>
            <Button variant="default" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={handleRevert}
              disabled={!isAnyDirty}
            >
              Revert Changes
            </Button>
            <Button
              onClick={handleSave}
              disabled={!isAnyDirty || !form.isValid()}
              loading={loading}
            >
              Save
            </Button>
          </Group>
        </Group>
      </form>

      {/* Delete confirmation modal */}
      <Modal
        opened={deleteModalOpened}
        onClose={() => setDeleteModalOpened(false)}
        title="Delete School Year"
        centered
      >
        <Text size="sm" mb="md">
          Are you sure you want to delete{" "}
          <strong>{schoolYear.year_range}</strong>? Its quarters will be
          inactivated, but all records under this school year will still be
          accessible.
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
          <Button variant="default" onClick={() => setDeleteModalOpened(false)}>
            Cancel
          </Button>
          <Button
            color="red"
            disabled={confirmText.toLowerCase() !== "delete"}
            loading={deleting}
            onClick={handleConfirmDelete}
          >
            Delete
          </Button>
        </Group>
      </Modal>
    </Drawer>
  );
}
