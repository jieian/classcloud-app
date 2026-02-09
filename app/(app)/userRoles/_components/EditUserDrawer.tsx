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
  Skeleton,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect, useState } from "react";
import { IconCheck, IconX, IconInfoCircle } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import type { UserWithRoles } from "../_lib";
import { updateUser, fetchAllRoles } from "../_lib";

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

/**
 * Converts string to Title Case and normalizes whitespace
 * "  jOHN    DOE  " → "John Doe"
 */
function toTitleCase(str: string): string {
  return str
    .trim()
    .replace(/\s+/g, " ") // Collapse multiple spaces to single space
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
  const [loadingRoles, setLoadingRoles] = useState(false);

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
        const trimmed = value.trim();
        if (!trimmed) return "First name is required";
        if (trimmed.length > 100) return "First name must be 100 characters or less";
        // No leading/trailing/consecutive spaces, letters only
        if (!/^[a-zA-Z]+(?:\s[a-zA-Z]+)*$/.test(trimmed))
          return "First name must contain only letters (no extra spaces)";
        return null;
      },
      middle_name: (value) => {
        if (!value) return null; // Optional field
        const trimmed = value.trim();
        if (trimmed.length > 100) return "Middle name must be 100 characters or less";
        // No leading/trailing/consecutive spaces, letters only
        if (!/^[a-zA-Z]+(?:\s[a-zA-Z]+)*$/.test(trimmed))
          return "Middle name must contain only letters (no extra spaces)";
        return null;
      },
      last_name: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return "Last name is required";
        if (trimmed.length > 100) return "Last name must be 100 characters or less";
        // No leading/trailing/consecutive spaces, letters only
        if (!/^[a-zA-Z]+(?:\s[a-zA-Z]+)*$/.test(trimmed))
          return "Last name must contain only letters (no extra spaces)";
        return null;
      },
      email: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return "Email is required";
        if (trimmed.length > 255) return "Email must be 255 characters or less";
        if (!/^\S+@\S+\.\S+$/.test(trimmed)) return "Invalid email format";
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

  async function loadRoles() {
    try {
      setLoadingRoles(true);
      const roles = await fetchAllRoles();
      setAvailableRoles(roles);
    } catch (error) {
      console.error("Failed to load roles:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to load roles. Please check console for details.";
      notifications.show({
        title: "Error Loading Roles",
        message: errorMessage,
        color: "red",
        autoClose: 10000, // Show for 10 seconds so user can read it
      });
    } finally {
      setLoadingRoles(false);
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
              maxLength={100}
              withErrorStyles
              {...form.getInputProps("first_name")}
              description={`${form.values.first_name.length}/100 characters`}
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
              maxLength={100}
              withErrorStyles
              {...form.getInputProps("middle_name")}
              description={`${form.values.middle_name.length}/100 characters`}
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
              maxLength={100}
              withErrorStyles
              {...form.getInputProps("last_name")}
              description={`${form.values.last_name.length}/100 characters`}
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
              maxLength={255}
              withErrorStyles
              {...form.getInputProps("email")}
              description={`${form.values.email.length}/255 characters`}
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
            {loadingRoles ? (
              <>
                <Skeleton height={24} mb="sm" />
                <Skeleton height={24} mb="sm" />
                <Skeleton height={24} mb="sm" />
                <Skeleton height={24} mb="sm" />
              </>
            ) : (
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
