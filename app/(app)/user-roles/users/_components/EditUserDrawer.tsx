"use client";

import {
  Alert,
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
  ThemeIcon,
  Tooltip,
  ActionIcon,
  Skeleton,
  UnstyledButton,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useMediaQuery } from "@mantine/hooks";
import { useEffect, useState } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconX,
  IconInfoCircle,
  IconLock,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notify } from "@/components/notificationIcon/notificationIcon";
import type { UserWithRoles, Role } from "../_lib";
import { updateUser, fetchAllRoles, checkPrincipalExists } from "../_lib";
import { sortRoles } from "@/lib/roleUtils";

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
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [principalWarning, setPrincipalWarning] = useState(false);
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
      first_name: user.first_name,
      middle_name: user.middle_name || "",
      last_name: user.last_name,
      changePassword: false,
      newPassword: "",
      confirmPassword: "",
      role_ids: user.roles.map((r) => r.role_id.toString()),
    },
    validate: {
      first_name: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return "First name is required";
        if (trimmed.length > 100)
          return "First name must be 100 characters or less";
        // No leading/trailing/consecutive spaces, letters and apostrophes only
        if (!/^[a-zA-Z][a-zA-Z']*(?:\s[a-zA-Z][a-zA-Z']*)*$/.test(trimmed))
          return "First name must contain only letters and apostrophes (no extra spaces)";
        return null;
      },
      middle_name: (value) => {
        if (!value) return null; // Optional field
        const trimmed = value.trim();
        if (trimmed.length > 100)
          return "Middle name must be 100 characters or less";
        // No leading/trailing/consecutive spaces, letters and apostrophes only
        if (!/^[a-zA-Z][a-zA-Z']*(?:\s[a-zA-Z][a-zA-Z']*)*$/.test(trimmed))
          return "Middle name must contain only letters and apostrophes (no extra spaces)";
        return null;
      },
      last_name: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return "Last name is required";
        if (trimmed.length > 100)
          return "Last name must be 100 characters or less";
        // No leading/trailing/consecutive spaces, letters and apostrophes only
        if (!/^[a-zA-Z][a-zA-Z']*(?:\s[a-zA-Z][a-zA-Z']*)*$/.test(trimmed))
          return "Last name must contain only letters and apostrophes (no extra spaces)";
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

  useEffect(() => {
    const hasPrincipal = form.values.role_ids.some(
      (id) => availableRoles.find((r) => r.role_id.toString() === id)?.name === "Principal",
    );
    const alreadyHadPrincipal = user.roles.some((r) => r.name === "Principal");
    if (!hasPrincipal || alreadyHadPrincipal) {
      setPrincipalWarning(false);
      return;
    }
    checkPrincipalExists()
      .then(setPrincipalWarning)
      .catch(() => setPrincipalWarning(false));
  }, [form.values.role_ids, availableRoles]);

  async function loadRoles() {
    try {
      setLoadingRoles(true);
      const roles = await fetchAllRoles();
      setAvailableRoles(sortRoles(roles));
    } catch (error) {
      console.error("Failed to load roles:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to load roles. Please check console for details.";
      notify({
        type: "error",
        title: "Error Loading Roles",
        message: errorMessage,
        autoClose: 10000,
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
        ...confirmModalProps,
      });
    } else {
      onClose();
    }
  };

  const handleSave = () => {
    const validation = form.validate();
    if (validation.hasErrors) {
      notify({
        type: "error",
        title: "Validation Error",
        message: "Please fix all errors before saving",
      });
      return;
    }

    const removedRoles = user.roles.filter(
      (r) => !form.values.role_ids.includes(r.role_id.toString()),
    );
    const hasCascade = removedRoles.some(
      (r) =>
        r.is_faculty ||
        r.name === "Grade Subject Leader" ||
        r.name === "Subject Coordinator",
    );

    modals.openConfirmModal({
      title: "Confirm updates?",
      children: (
        <>
          <Text size="sm">
            Changes cannot be reverted. Are you sure you want to update this user?
          </Text>
          {hasCascade && (
            <Alert
              variant="filled"
              radius="md"
              mt="sm"
              styles={{
                root: { backgroundColor: "#fae173" },
                icon: { alignSelf: "center", marginTop: 0 },
              }}
              icon={
                <ThemeIcon color="#2A2A2A" variant="transparent" size="md">
                  <IconAlertTriangle size={20} />
                </ThemeIcon>
              }
            >
              <Text fw={700} size="sm" c="#2A2A2A">
                Role removal will affect existing assignments
              </Text>
              <Text size="sm" fs="italic" c="#2A2A2A">
                Their related assignments (if any) will also be removed.
              </Text>
            </Alert>
          )}
        </>
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

      const formattedData = {
        uid: user.uid,
        first_name: toTitleCase(form.values.first_name.trim()),
        middle_name: form.values.middle_name.trim()
          ? toTitleCase(form.values.middle_name.trim())
          : undefined,
        last_name: toTitleCase(form.values.last_name.trim()),
        newPassword: form.values.changePassword
          ? form.values.newPassword
          : undefined,
        role_ids: form.values.role_ids.map((id) => parseInt(id)),
      };

      await updateUser(formattedData);

      notify({
        type: "success",
        title: "Success",
        message: "User updated successfully",
      });

      form.reset();
      onSuccess();
      onClose();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update user. Please try again.";
      notify({
        type: "error",
        title: "Error",
        message,
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
      title="Edit User Details"
      position="bottom"
      size="lg"
      overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
      styles={{ body: { overflowY: "auto" } }}
    >
      <form>
        <Grid gutter="lg">
          {/* Column I: User Info */}
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Text size="sm" fw={600} mb="md">
              User Information
            </Text>
            <Tooltip
              label="Email is locked and cannot be changed"
              position="top"
              withArrow
            >
              <Box mb="md">
                <TextInput
                  label="Email"
                  value={user.email}
                  readOnly
                  rightSection={
                    <IconLock size={16} style={{ color: "#808898" }} />
                  }
                  styles={{
                    input: {
                      backgroundColor: "#f5f5f5",
                      cursor: "default",
                      color: "#808898",
                    },
                  }}
                />
              </Box>
            </Tooltip>
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
          </Grid.Col>

          {/* Column II: Password */}
          <Grid.Col span={{ base: 12, sm: 4 }}>
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
          <Grid.Col span={{ base: 12, sm: 4 }}>
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
                    label={
                      <Group gap={6} wrap="nowrap">
                        <Text size="sm">{role.name}</Text>
                        {role.name === "Principal" && principalWarning && (
                          <Tooltip
                            label="A Principal already exists. Assigning this role to another user may cause conflicts."
                            withArrow
                            multiline
                            w={260}
                            events={isMobile
                              ? { hover: false, focus: false, touch: true }
                              : { hover: true, focus: false, touch: false }
                            }
                          >
                            <IconAlertTriangle
                              size={18}
                              stroke={2}
                              color="#c4a827"
                              style={{ flexShrink: 0, cursor: "default" }}
                            />
                          </Tooltip>
                        )}
                      </Group>
                    }
                    mb="sm"
                  />
                ))}
              </Checkbox.Group>
            )}
          </Grid.Col>
        </Grid>

        {/* Action Buttons */}
        {isMobile ? (
          <div
            style={{
              position: "sticky",
              bottom: 0,
              backgroundColor: "#fff",
              borderTop: "1px solid #e9ecef",
              padding: "12px 0",
              paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
              marginTop: "var(--mantine-spacing-xl)",
            }}
          >
            <Group justify="flex-end" wrap="nowrap">
              <UnstyledButton onClick={handleClose} style={{ cursor: "pointer" }}>
                <Text size="sm" fw={600}>Cancel</Text>
              </UnstyledButton>
              <Button
                variant="default"
                radius="md"
                onClick={() => form.reset()}
                disabled={!form.isDirty()}
              >
                Revert
              </Button>
              <Button
                radius="md"
                onClick={handleSave}
                disabled={!form.isDirty() || !form.isValid()}
                loading={loading}
                style={form.isDirty() && form.isValid() ? { backgroundColor: "#4EAE4A" } : undefined}
              >
                Save
              </Button>
            </Group>
          </div>
        ) : (
          <Group justify="flex-end" mt="xl" wrap="nowrap">
            <UnstyledButton onClick={handleClose} style={{ cursor: "pointer" }}>
              <Text size="sm" fw={600}>Cancel</Text>
            </UnstyledButton>
            <Button
              variant="default"
              radius="md"
              onClick={() => form.reset()}
              disabled={!form.isDirty()}
            >
              Revert Changes
            </Button>
            <Button
              radius="md"
              onClick={handleSave}
              disabled={!form.isDirty() || !form.isValid()}
              loading={loading}
              style={form.isDirty() && form.isValid() ? { backgroundColor: "#4EAE4A" } : undefined}
            >
              Save
            </Button>
          </Group>
        )}
      </form>
    </Drawer>
  );
}
