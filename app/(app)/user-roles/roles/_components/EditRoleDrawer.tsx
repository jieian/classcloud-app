"use client";

import {
  Button,
  Checkbox,
  Drawer,
  Grid,
  Group,
  Pagination,
  Skeleton,
  Text,
  TextInput,
  Tooltip,
  ActionIcon,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect, useState } from "react";
import { IconInfoCircle } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import type { RoleWithPermissions, Permission } from "../../users/_lib";
import {
  fetchAllPermissions,
  updateRole,
  checkRoleNameExists,
} from "../../users/_lib";

interface EditRoleDrawerProps {
  opened: boolean;
  onClose: () => void;
  role: RoleWithPermissions;
  onSuccess: () => void;
}

interface FormValues {
  name: string;
  permission_ids: string[];
}

const PERMISSIONS_PER_PAGE = 5;

export default function EditRoleDrawer({
  opened,
  onClose,
  role,
  onSuccess,
}: EditRoleDrawerProps) {
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [permPage, setPermPage] = useState(1);

  const form = useForm<FormValues>({
    validateInputOnChange: true,
    initialValues: {
      name: role.name,
      permission_ids: role.permissions.map((p) => p.permission_id.toString()),
    },
    validate: {
      name: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return "Role Name is required";
        if (trimmed.length > 50) return "Name must be 50 characters or less";
        if (!/^[a-zA-Z]+(?:\s[a-zA-Z]+)*$/.test(trimmed))
          return "Role Name must contain only letters (no extra spaces or symbols)";
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
        permission_ids: role.permissions.map((p) =>
          p.permission_id.toString(),
        ),
      });
      form.resetDirty();
      setPermPage(1);
    }
  }, [opened, role]);

  // Warn user before leaving page with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (form.isDirty() && opened) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [form.isDirty(), opened]);

  async function loadPermissions() {
    try {
      setLoadingPermissions(true);
      const permissions = await fetchAllPermissions();
      setAllPermissions(permissions);
    } catch (error) {
      console.error("Failed to load permissions:", error);
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
      confirmProps: { color: "blue" },
      onConfirm: async () => {
        await submitForm();
      },
    });
  };

  const submitForm = async () => {
    try {
      setLoading(true);

      const trimmedName = form.values.name.trim();

      // Check name uniqueness before submitting
      const nameChanged =
        trimmedName.toLowerCase() !== role.name.toLowerCase();
      if (nameChanged) {
        const nameTaken = await checkRoleNameExists(
          trimmedName,
          role.role_id,
        );
        if (nameTaken) {
          form.setFieldError(
            "name",
            "This role name is already in use",
          );
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

  // Pagination for permissions
  const totalPages = Math.ceil(allPermissions.length / PERMISSIONS_PER_PAGE);
  const paginatedPermissions = allPermissions.slice(
    (permPage - 1) * PERMISSIONS_PER_PAGE,
    permPage * PERMISSIONS_PER_PAGE,
  );

  return (
    <Drawer
      opened={opened}
      onClose={handleClose}
      title="Update Role Details"
      position="bottom"
      size="xl"
      overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
    >
      <form>
        <Grid gutter="lg">
          {/* Column I: Role Information */}
          <Grid.Col span={6}>
            <Text size="sm" fw={600} mb="md">
              Role Information
            </Text>
            <TextInput
              label="Role Name"
              placeholder="Enter role name"
              required
              maxLength={50}
              withErrorStyles
              {...form.getInputProps("name")}
              description={`${form.values.name.length}/50 characters`}
              rightSection={
                form.errors.name ? (
                  <Tooltip label={form.errors.name} position="top">
                    <ActionIcon variant="transparent" color="red" size="sm">
                      <IconInfoCircle size={16} />
                    </ActionIcon>
                  </Tooltip>
                ) : null
              }
              mb="md"
            />
          </Grid.Col>

          {/* Column II: Permissions */}
          <Grid.Col span={6}>
            <Text size="sm" fw={600} mb="md">
              Permissions
            </Text>
            {loadingPermissions ? (
              <>
                <Skeleton height={24} mb="sm" />
                <Skeleton height={24} mb="sm" />
                <Skeleton height={24} mb="sm" />
                <Skeleton height={24} mb="sm" />
                <Skeleton height={24} mb="sm" />
              </>
            ) : (
              <>
                {form.errors.permission_ids && (
                  <Text size="sm" c="red" mb="xs">
                    {form.errors.permission_ids}
                  </Text>
                )}
                <Text size="xs" c="dimmed" mb="xs">
                  {form.values.permission_ids.length} of{" "}
                  {allPermissions.length} selected
                </Text>
                <Checkbox.Group {...form.getInputProps("permission_ids")}>
                  {paginatedPermissions.map((perm) => (
                    <Tooltip
                      key={perm.permission_id}
                      label={perm.description}
                      position="left"
                      withArrow
                      multiline
                      maw={300}
                      disabled={!perm.description}
                    >
                      <Checkbox
                        value={perm.permission_id.toString()}
                        label={perm.name}
                        mb="sm"
                      />
                    </Tooltip>
                  ))}
                </Checkbox.Group>
                {totalPages > 1 && (
                  <Pagination
                    value={permPage}
                    onChange={setPermPage}
                    total={totalPages}
                    size="sm"
                    mt="sm"
                  />
                )}
              </>
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
          >
            Save
          </Button>
        </Group>
      </form>
    </Drawer>
  );
}
