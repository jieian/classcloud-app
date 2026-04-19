"use client";

import {
  ActionIcon,
  Box,
  Button,
  Drawer,
  Grid,
  Group,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useMediaQuery } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { IconInfoCircle, IconLock } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import type { RoleWithPermissions, Permission } from "../../users/_lib";
import {
  fetchAllPermissions,
  updateRole,
  checkRoleNameExists,
} from "../../users/_lib";
import { PermissionsPanel } from "./PermissionsPanel";

interface EditRoleDrawerProps {
  opened: boolean;
  onClose: () => void;
  role: RoleWithPermissions;
  onSuccess: () => void;
  isProtectedRole?: boolean;
}

interface FormValues {
  name: string;
  is_faculty: boolean;
  is_self_registerable: boolean;
  permission_ids: string[];
}

function SwitchLabel({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <Group gap={4} wrap="nowrap" align="center">
      <span>{label}</span>
      <Tooltip
        label={tooltip}
        multiline
        maw={260}
        withArrow
        events={{ hover: true, touch: true, focus: true }}
      >
        <ActionIcon variant="transparent" size="xs" color="#808898" tabIndex={0}>
          <IconInfoCircle size={14} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

export default function EditRoleDrawer({
  opened,
  onClose,
  role,
  onSuccess,
  isProtectedRole = false,
}: EditRoleDrawerProps) {
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPermissions, setLoadingPermissions] = useState(false);

  const isMobile = useMediaQuery("(max-width: 768px)");
  const confirmModalProps = isMobile
    ? {
        styles: {
          inner: { alignItems: "flex-end", paddingBottom: "20px" },
          content: {
            width: "100%",
            maxWidth: "100%",
            borderRadius: "12px 12px 0 0",
          },
        },
      }
    : {};

  const form = useForm<FormValues>({
    validateInputOnChange: true,
    initialValues: {
      name: role.name,
      is_faculty: role.is_faculty,
      is_self_registerable: role.is_self_registerable,
      permission_ids: role.permissions.map((p) => p.permission_id.toString()),
    },
    validate: {
      name: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return "Role name is required";
        if (trimmed.length > 50) return "Role name must be 50 characters or less";
        if (!/[a-zA-Z]/.test(trimmed))
          return "Role name must contain at least one letter";
        if (!/^[a-zA-Z0-9]+(?:[\s\-][a-zA-Z0-9]+)*$/.test(trimmed))
          return "Role name may only contain letters and numbers";
        return null;
      },
      permission_ids: (value) => {
        if (!value || value.length === 0)
          return "Select at least one permission";
        return null;
      },
    },
  });

  useEffect(() => {
    if (opened) {
      loadPermissions();
      form.setValues({
        name: role.name,
        is_faculty: role.is_faculty,
        is_self_registerable: role.is_self_registerable,
        permission_ids: role.permissions.map((p) => p.permission_id.toString()),
      });
      form.resetDirty();
    }
  }, [opened, role]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (form.isDirty() && opened) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [form.isDirty(), opened]);

  async function loadPermissions() {
    try {
      setLoadingPermissions(true);
      const permissions = await fetchAllPermissions();
      setAllPermissions(permissions);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to load permissions. Please check console for details.";
      notifications.show({
        title: "Error Loading Permissions",
        message: errorMessage,
        color: "red",
        autoClose: 10000,
      });
    } finally {
      setLoadingPermissions(false);
    }
  }

  const handleClose = () => {
    if (form.isDirty()) {
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
        ...confirmModalProps,
      });
    } else {
      onClose();
    }
  };

  const handleSave = () => {
    const validation = form.validate();
    if (validation.hasErrors) {
      notifications.show({
        title: "Validation Error",
        message: "Please fix all errors before saving",
        color: "red",
      });
      return;
    }

    modals.openConfirmModal({
      title: "Confirm updates?",
      children: (
        <Text size="sm">
          Changes cannot be reverted. Are you sure you want to update this role?
        </Text>
      ),
      labels: { confirm: "Confirm", cancel: "Cancel" },
      confirmProps: { color: "#4EAE4A" },
      onConfirm: async () => {
        await submitForm();
      },
      ...confirmModalProps,
    });
  };

  const submitForm = async () => {
    try {
      setLoading(true);

      const trimmedName = form.values.name.trim();

      const nameChanged = trimmedName.toLowerCase() !== role.name.toLowerCase();
      if (nameChanged) {
        const nameTaken = await checkRoleNameExists(trimmedName, role.role_id);
        if (nameTaken) {
          form.setFieldError("name", "This role name is already in use");
          notifications.show({
            title: "Role Name Already In Use",
            message: "Please use a different role name.",
            color: "red",
          });
          return;
        }
      }

      await updateRole(
        role.role_id,
        trimmedName,
        form.values.is_faculty,
        form.values.is_self_registerable,
        form.values.permission_ids.map((id) => parseInt(id)),
      );

      notifications.show({
        title: "Success",
        message: "Role updated successfully",
        color: "green",
      });

      form.reset();
      onSuccess();
      onClose();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update role. Please try again.";
      notifications.show({
        title: "Error",
        message,
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer
      opened={opened}
      onClose={handleClose}
      title="Edit Role Details"
      position="bottom"
      size="lg"
      overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
    >
      <form>
        <Grid gutter="lg">
          {/* Column I: Role Information + Configuration */}
          <Grid.Col span={6}>
            <Text size="sm" fw={600} mb="md">
              Role Information
            </Text>
            <Tooltip
              label="This is a protected role. The name cannot be changed."
              withArrow
              disabled={!isProtectedRole}
              events={{ hover: true, touch: true, focus: true }}
            >
              <TextInput
                label="Role Name"
                placeholder="Enter role name"
                required
                maxLength={50}
                withErrorStyles
                disabled={isProtectedRole}
                description={
                  isProtectedRole
                    ? "Protected role names cannot be changed."
                    : `${form.values.name.length}/50 characters`
                }
                {...form.getInputProps("name")}
                rightSection={
                  isProtectedRole ? (
                    <IconLock size={16} style={{ color: "#808898" }} />
                  ) : form.errors.name ? (
                    <Tooltip label={form.errors.name} position="top">
                      <ActionIcon variant="transparent" color="red" size="sm">
                        <IconInfoCircle size={16} />
                      </ActionIcon>
                    </Tooltip>
                  ) : null
                }
                mb="lg"
              />
            </Tooltip>

            <Text size="sm" fw={600} mb="md">
              Role Configuration
            </Text>
            <Box style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Switch
                label={
                  <SwitchLabel
                    label="Faculty Role"
                    tooltip="When enabled, users with this role can be assigned an advisory class, a teaching load, or a coordinator position."
                  />
                }
                description="This user can be assigned teaching responsibilities and advisory duties."
                checked={form.values.is_faculty}
                disabled={isProtectedRole}
                onChange={(e) =>
                  form.setFieldValue("is_faculty", e.currentTarget.checked)
                }
              />
              <Switch
                label={
                  <SwitchLabel
                    label="Self-Registerable"
                    tooltip="When enabled, this role will appear as an option during sign-up. For security, only expose roles that are safe for public self-registration."
                  />
                }
                description="This role will be visible and selectable by users on the sign-up page."
                checked={form.values.is_self_registerable}
                disabled={isProtectedRole}
                onChange={(e) =>
                  form.setFieldValue(
                    "is_self_registerable",
                    e.currentTarget.checked,
                  )
                }
              />
            </Box>
          </Grid.Col>

          {/* Column II: Permissions */}
          <Grid.Col span={6}>
            <PermissionsPanel
              compact
              selectedIds={form.values.permission_ids.map(Number)}
              onChange={(ids) =>
                form.setFieldValue("permission_ids", ids.map(String))
              }
              availablePermissions={allPermissions}
              loading={loadingPermissions}
            />
            {form.errors.permission_ids && (
              <Text size="sm" c="red" mt="xs">
                {form.errors.permission_ids}
              </Text>
            )}
          </Grid.Col>
        </Grid>

        {/* Action Buttons */}
        <Group justify="flex-end" mt="xl">
          <Button variant="default" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => form.reset()}
            disabled={!form.isDirty()}
          >
            Revert Changes
          </Button>
          <Button
            onClick={handleSave}
            disabled={!form.isDirty() || !form.isValid()}
            loading={loading}
            color="#4EAE4A"
          >
            Save
          </Button>
        </Group>
      </form>
    </Drawer>
  );
}
