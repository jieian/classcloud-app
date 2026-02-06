"use client";

import {
  Box,
  Button,
  Center,
  Checkbox,
  Drawer,
  Grid,
  Group,
  PasswordInput,
  Progress,
  Text,
  TextInput,
  Tooltip,
  ActionIcon,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect, useState } from "react";
import { IconCheck, IconX, IconInfoCircle } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import type { UserWithRoles } from "@/lib/userRolesService";
import { updateUser } from "@/lib/userUpdateService";
import { fetchAllRoles } from "@/lib/userUpdateService";

interface EditUserDrawerProps {
  opened: boolean;
  onClose: () => void;
  user: UserWithRoles;
  onSuccess: () => void;
}

interface FormValues {
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  changePassword: boolean;
  newPassword: string;
  confirmPassword: string;
  role_ids: string[];
}

const passwordRequirements = [
  { re: /[0-9]/, label: "Includes number" },
  { re: /[a-z]/, label: "Includes lowercase letter" },
  { re: /[A-Z]/, label: "Includes uppercase letter" },
  { re: /[$&+,:;=?@#|'<>.^*()%!-]/, label: "Includes special symbol" },
];

function getPasswordStrength(password: string) {
  let multiplier = password.length >= 8 ? 0 : 1;

  passwordRequirements.forEach((requirement) => {
    if (!requirement.re.test(password)) {
      multiplier += 1;
    }
  });

  return Math.max(
    100 - (100 / (passwordRequirements.length + 1)) * multiplier,
    0,
  );
}

function PasswordRequirement({
  meets,
  label,
}: {
  meets: boolean;
  label: string;
}) {
  return (
    <Text component="div" c={meets ? "teal" : "red"} mt={5} size="sm">
      <Center inline>
        {meets ? (
          <IconCheck size={14} stroke={1.5} />
        ) : (
          <IconX size={14} stroke={1.5} />
        )}
        <Box ml={7}>{label}</Box>
      </Center>
    </Text>
  );
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function EditUserDrawer({
  opened,
  onClose,
  user,
  onSuccess,
}: EditUserDrawerProps) {
  const [availableRoles, setAvailableRoles] = useState<
    Array<{ role_id: number; name: string }>
  >([]);
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValues>({
    validateInputOnChange: true,
    initialValues: {
      first_name: user.first_name,
      middle_name: user.middle_name || "",
      last_name: user.last_name,
      email: user.email,
      changePassword: false,
      newPassword: "",
      confirmPassword: "",
      role_ids: user.roles.map((r) => r.role_id.toString()),
    },
    validate: {
      first_name: (value) => {
        if (!value.trim()) return "First name is required";
        if (!/^[a-zA-Z\s]+$/.test(value))
          return "First name must contain only letters";
        return null;
      },
      middle_name: (value) => {
        if (value && !/^[a-zA-Z\s]+$/.test(value))
          return "Middle name must contain only letters";
        return null;
      },
      last_name: (value) => {
        if (!value.trim()) return "Last name is required";
        if (!/^[a-zA-Z\s]+$/.test(value))
          return "Last name must contain only letters";
        return null;
      },
      email: (value) => {
        if (!value.trim()) return "Email is required";
        if (!/^\S+@\S+\.\S+$/.test(value)) return "Invalid email format";
        return null;
      },
      newPassword: (value, values) => {
        if (!values.changePassword) return null;
        if (!value) return "New password is required";
        if (value.length < 8) return "Password must be at least 8 characters";
        if (!/[0-9]/.test(value)) return "Password must include a number";
        if (!/[a-z]/.test(value))
          return "Password must include a lowercase letter";
        if (!/[A-Z]/.test(value))
          return "Password must include an uppercase letter";
        if (!/[$&+,:;=?@#|'<>.^*()%!-]/.test(value))
          return "Password must include a special symbol";
        return null;
      },
      confirmPassword: (value, values) => {
        if (!values.changePassword) return null;
        if (!value) return "Please confirm your password";
        if (value !== values.newPassword) return "Passwords do not match";
        return null;
      },
    },
  });

  useEffect(() => {
    if (opened) {
      loadRoles();
      // Reset form when drawer opens
      form.setValues({
        first_name: user.first_name,
        middle_name: user.middle_name || "",
        last_name: user.last_name,
        email: user.email,
        changePassword: false,
        newPassword: "",
        confirmPassword: "",
        role_ids: user.roles.map((r) => r.role_id.toString()),
      });
      form.resetDirty();
    }
  }, [opened, user]);

  async function loadRoles() {
    try {
      const roles = await fetchAllRoles();
      setAvailableRoles(roles);
    } catch (error) {
      notifications.show({
        title: "Error",
        message: "Failed to load roles",
        color: "red",
      });
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
          Changes cannot be reverted. Are you sure you want to update this user?
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

      // Transform names to title case
      const formattedData = {
        user_id: user.user_id,
        first_name: toTitleCase(form.values.first_name.trim()),
        middle_name: form.values.middle_name.trim()
          ? toTitleCase(form.values.middle_name.trim())
          : undefined,
        last_name: toTitleCase(form.values.last_name.trim()),
        email: form.values.email.trim(),
        password: form.values.changePassword
          ? form.values.newPassword
          : undefined,
        role_ids: form.values.role_ids.map((id) => parseInt(id)),
      };

      await updateUser(formattedData);

      notifications.show({
        title: "Success",
        message: "User updated successfully",
        color: "green",
      });

      form.reset();
      onSuccess();
      onClose();
    } catch (error) {
      notifications.show({
        title: "Error",
        message: "Failed to update user. Please try again.",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = getPasswordStrength(form.values.newPassword);
  const passwordChecks = passwordRequirements.map((requirement, index) => (
    <PasswordRequirement
      key={index}
      label={requirement.label}
      meets={requirement.re.test(form.values.newPassword)}
    />
  ));

  const passwordBars = Array(4)
    .fill(0)
    .map((_, index) => (
      <Progress
        key={index}
        styles={{ section: { transitionDuration: "0ms" } }}
        value={
          form.values.newPassword.length > 0 && index === 0
            ? 100
            : passwordStrength >= ((index + 1) / 4) * 100
              ? 100
              : 0
        }
        color={
          passwordStrength > 80
            ? "teal"
            : passwordStrength > 50
              ? "yellow"
              : "red"
        }
        size={4}
        aria-label={`Password strength segment ${index + 1}`}
      />
    ));

  return (
    <Drawer
      opened={opened}
      onClose={handleClose}
      title="Update User Details"
      position="bottom"
      size="xl"
      overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
    >
      <form>
        <Grid gutter="lg">
          {/* Column I: User Info */}
          <Grid.Col span={4}>
            <Text size="sm" fw={600} mb="md">
              User Information
            </Text>
            <TextInput
              label="First Name"
              placeholder="Enter first name"
              required
              withErrorStyles
              {...form.getInputProps("first_name")}
              rightSection={
                form.errors.first_name ? (
                  <Tooltip label={form.errors.first_name} position="top">
                    <ActionIcon variant="transparent" color="red" size="sm">
                      <IconInfoCircle size={16} />
                    </ActionIcon>
                  </Tooltip>
                ) : null
              }
              mb="md"
            />
            <TextInput
              label="Middle Name"
              placeholder="Enter middle name (optional)"
              withErrorStyles
              {...form.getInputProps("middle_name")}
              rightSection={
                form.errors.middle_name ? (
                  <Tooltip label={form.errors.middle_name} position="top">
                    <ActionIcon variant="transparent" color="red" size="sm">
                      <IconInfoCircle size={16} />
                    </ActionIcon>
                  </Tooltip>
                ) : null
              }
              mb="md"
            />
            <TextInput
              label="Last Name"
              placeholder="Enter last name"
              required
              withErrorStyles
              {...form.getInputProps("last_name")}
              rightSection={
                form.errors.last_name ? (
                  <Tooltip label={form.errors.last_name} position="top">
                    <ActionIcon variant="transparent" color="red" size="sm">
                      <IconInfoCircle size={16} />
                    </ActionIcon>
                  </Tooltip>
                ) : null
              }
              mb="md"
            />
            <TextInput
              label="Email"
              placeholder="Enter email"
              required
              withErrorStyles
              {...form.getInputProps("email")}
              rightSection={
                form.errors.email ? (
                  <Tooltip label={form.errors.email} position="top">
                    <ActionIcon variant="transparent" color="red" size="sm">
                      <IconInfoCircle size={16} />
                    </ActionIcon>
                  </Tooltip>
                ) : null
              }
            />
          </Grid.Col>

          {/* Column II: Password */}
          <Grid.Col span={4}>
            <Text size="sm" fw={600} mb="md">
              Password
            </Text>
            <Checkbox
              label="Change password?"
              {...form.getInputProps("changePassword", { type: "checkbox" })}
              mb="md"
            />
            {form.values.changePassword && (
              <>
                <PasswordInput
                  label="New Password"
                  placeholder="Enter new password"
                  required
                  withErrorStyles
                  {...form.getInputProps("newPassword")}
                  mb="xs"
                />
                <Group gap={5} grow mb="md">
                  {passwordBars}
                </Group>
                <PasswordRequirement
                  label="Has at least 8 characters"
                  meets={form.values.newPassword.length >= 8}
                />
                {passwordChecks}
                <PasswordInput
                  label="Confirm Password"
                  placeholder="Confirm new password"
                  required
                  withErrorStyles
                  {...form.getInputProps("confirmPassword")}
                  mt="md"
                  rightSection={
                    form.errors.confirmPassword ? (
                      <Tooltip
                        label={form.errors.confirmPassword}
                        position="top"
                      >
                        <ActionIcon variant="transparent" color="red" size="sm">
                          <IconInfoCircle size={16} />
                        </ActionIcon>
                      </Tooltip>
                    ) : null
                  }
                />
              </>
            )}
          </Grid.Col>

          {/* Column III: Roles */}
          <Grid.Col span={4}>
            <Text size="sm" fw={600} mb="md">
              Roles
            </Text>
            <Checkbox.Group {...form.getInputProps("role_ids")}>
              {availableRoles.map((role) => (
                <Checkbox
                  key={role.role_id}
                  value={role.role_id.toString()}
                  label={role.name}
                  mb="sm"
                />
              ))}
            </Checkbox.Group>
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
