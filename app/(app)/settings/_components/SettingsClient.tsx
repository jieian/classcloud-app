"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Center,
  Divider,
  Group,
  Modal,
  Paper,
  PasswordInput,
  Progress,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notify } from "@/components/notificationIcon/notificationIcon";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconAlertCircle,
  IconCheck,
  IconPencil,
  IconX,
} from "@tabler/icons-react";
import { useAuth } from "@/context/AuthContext";
import { getPasswordStrength, passwordRequirements } from "@/app/(app)/user-roles/users/_lib/utils";

function PasswordRequirement({ meets, label }: { meets: boolean; label: string }) {
  return (
    <Text component="div" c={meets ? "teal" : "red"} mt={5} size="sm">
      <Center inline>
        {meets ? <IconCheck size={14} stroke={1.5} /> : <IconX size={14} stroke={1.5} />}
        <Box ml={7}>{label}</Box>
      </Center>
    </Text>
  );
}

interface Role {
  role_id: number;
  name: string;
}

interface Profile {
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  roles: Role[];
}

interface FormValues {
  first_name: string;
  middle_name: string;
  last_name: string;
}

interface PasswordFormValues {
  old_password: string;
  new_password: string;
  confirm_password: string;
}

const NAME_REGEX = /^[a-zA-Z][a-zA-Z']*(?:\s[a-zA-Z][a-zA-Z']*)*$/;

export default function SettingsClient() {
  const { refreshUserName } = useAuth();
  const isMobile = useMediaQuery("(max-width: 640px)");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editModalOpened, setEditModalOpened] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passwordModalOpened, setPasswordModalOpened] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const form = useForm<FormValues>({
    validateInputOnChange: true,
    initialValues: { first_name: "", middle_name: "", last_name: "" },
    validate: {
      first_name: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return "First name is required";
        if (trimmed.length > 100) return "First name must be 100 characters or less";
        if (!NAME_REGEX.test(trimmed))
          return "First name must contain only letters and apostrophes (no extra spaces)";
        return null;
      },
      middle_name: (value) => {
        if (!value) return null;
        const trimmed = value.trim();
        if (trimmed.length > 100) return "Middle name must be 100 characters or less";
        if (!NAME_REGEX.test(trimmed))
          return "Middle name must contain only letters and apostrophes (no extra spaces)";
        return null;
      },
      last_name: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return "Last name is required";
        if (trimmed.length > 100) return "Last name must be 100 characters or less";
        if (!NAME_REGEX.test(trimmed))
          return "Last name must contain only letters and apostrophes (no extra spaces)";
        return null;
      },
    },
  });
  const formIsDirty = form.isDirty();

  const passwordForm = useForm<PasswordFormValues>({
    validateInputOnChange: true,
    initialValues: { old_password: "", new_password: "", confirm_password: "" },
    validate: {
      old_password: (v) => (!v.trim() ? "Current password is required" : null),
      new_password: (v) => {
        if (!v) return "New password is required";
        if (v.length < 8) return "Password must be at least 8 characters";
        if (!/[0-9]/.test(v)) return "Password must include a number";
        if (!/[a-z]/.test(v)) return "Password must include a lowercase letter";
        if (!/[A-Z]/.test(v)) return "Password must include an uppercase letter";
        if (!/[$&+,:;=?@#|'<>.^*()%!-]/.test(v)) return "Password must include a special symbol";
        return null;
      },
      confirm_password: (v, vals) =>
        v !== vals.new_password ? "Passwords do not match" : null,
    },
  });

  const newPasswordValue = passwordForm.values.new_password;
  const passwordStrength = getPasswordStrength(newPasswordValue);
  const strengthColor = passwordStrength > 80 ? "teal" : passwordStrength > 50 ? "yellow" : "red";
  const passwordBars = Array(4)
    .fill(0)
    .map((_, index) => (
      <Progress
        key={index}
        styles={{ section: { transitionDuration: "0ms" } }}
        value={
          newPasswordValue.length > 0 && index === 0
            ? 100
            : passwordStrength >= ((index + 1) / 4) * 100
              ? 100
              : 0
        }
        color={strengthColor}
        size={4}
      />
    ));

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/profile");
      if (!res.ok) throw new Error("Failed to load profile.");
      const json = (await res.json()) as { profile: Profile };
      setProfile(json.profile);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile.");
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        await loadProfile();
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [loadProfile]);

  const openEditModal = () => {
    if (!profile) return;
    form.setValues({
      first_name: profile.first_name,
      middle_name: profile.middle_name,
      last_name: profile.last_name,
    });
    form.resetDirty();
    setEditModalOpened(true);
  };

  const handleCloseModal = () => {
    if (saving) return;
    if (formIsDirty) {
      modals.openConfirmModal({
        title: "Discard changes?",
        centered: true,
        children: (
          <Text size="sm">
            Are you sure you want to discard your unsaved changes?
          </Text>
        ),
        labels: { confirm: "Discard", cancel: "Cancel" },
        confirmProps: { color: "red" },
        onConfirm: () => {
          form.reset();
          setEditModalOpened(false);
        },
      });
    } else {
      form.reset();
      setEditModalOpened(false);
    }
  };

  const handleSave = async () => {
    const validation = form.validate();
    if (validation.hasErrors) {
      notify({
        type: "error",
        title: "Validation Error",
        message: "Please fix all errors before saving.",
      });
      return;
    }
    await submitSave();
  };

  const submitSave = async () => {
    try {
      setSaving(true);
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: form.values.first_name.trim(),
          middle_name: form.values.middle_name.trim() || null,
          last_name: form.values.last_name.trim(),
        }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Failed to save changes.");
      }

      const json = (await res.json()) as {
        first_name: string;
        middle_name: string | null;
        last_name: string;
      };

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              first_name: json.first_name,
              middle_name: json.middle_name ?? "",
              last_name: json.last_name,
            }
          : prev,
      );

      await refreshUserName();

      notify({
        type: "success",
        title: "Success",
        message: "Profile updated successfully.",
      });

      form.reset();
      setEditModalOpened(false);
    } catch (e) {
      notify({
        type: "error",
        title: "Error",
        message: e instanceof Error ? e.message : "Failed to save changes.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClosePasswordModal = () => {
    if (savingPassword) return;
    passwordForm.reset();
    setPasswordModalOpened(false);
  };

  const handleChangePassword = async () => {
    const validation = passwordForm.validate();
    if (validation.hasErrors) return;
    setSavingPassword(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldPassword: passwordForm.values.old_password,
          newPassword: passwordForm.values.new_password,
          confirmPassword: passwordForm.values.confirm_password,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to change password.");
      notify({
        type: "success",
        title: "Success",
        message: "Password changed successfully.",
      });
      handleClosePasswordModal();
    } catch (e) {
      notify({
        type: "error",
        title: "Error",
        message: e instanceof Error ? e.message : "Failed to change password.",
      });
    } finally {
      setSavingPassword(false);
    }
  };

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Stack gap="md" maw={680} style={{ width: "100%" }}>
        <Skeleton height={130} radius="md" />
        <Skeleton height={100} radius="md" />
        <Skeleton height={80} radius="md" />
      </Stack>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────
  if (error || !profile) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />} mt="md">
        {error ?? "Profile not found."}
      </Alert>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <Stack gap="md" maw={680}>
      {/* ── Edit Profile Modal ────────────────────────────────────────────── */}
      <Modal
        opened={editModalOpened}
        onClose={handleCloseModal}
        title="Edit Profile"
        centered
        size="md"
        closeOnClickOutside={!saving}
        closeOnEscape={!saving}
        withCloseButton={!saving}
      >
        <Stack gap="md">
          <TextInput
            label="First Name"
            withAsterisk
            value={form.values.first_name}
            onChange={(e) => form.setFieldValue("first_name", e.currentTarget.value)}
            onBlur={() => form.validateField("first_name")}
            error={form.errors.first_name as string | undefined}
          />
          <TextInput
            label="Middle Name"
            placeholder="(optional)"
            value={form.values.middle_name}
            onChange={(e) => form.setFieldValue("middle_name", e.currentTarget.value)}
            onBlur={() => form.validateField("middle_name")}
            error={form.errors.middle_name as string | undefined}
          />
          <TextInput
            label="Last Name"
            withAsterisk
            value={form.values.last_name}
            onChange={(e) => form.setFieldValue("last_name", e.currentTarget.value)}
            onBlur={() => form.validateField("last_name")}
            error={form.errors.last_name as string | undefined}
          />
          <Divider />
          <Group justify="flex-end">
            <Button variant="default" onClick={handleCloseModal} disabled={saving}>
              Cancel
            </Button>
            <Button
              color="#4EAE4A"
              onClick={() => void handleSave()}
              loading={saving}
              disabled={!formIsDirty || !form.isValid() || saving}
            >
              Save Changes
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ── Change Password Modal ─────────────────────────────────────────── */}
      <Modal
        opened={passwordModalOpened}
        onClose={handleClosePasswordModal}
        title="Change Password"
        centered
        size="md"
        closeOnClickOutside={!savingPassword}
        closeOnEscape={!savingPassword}
        withCloseButton={!savingPassword}
      >
        <Stack gap="md">
          <PasswordInput
            label="Old Password"
            withAsterisk
            value={passwordForm.values.old_password}
            onChange={(e) => passwordForm.setFieldValue("old_password", e.currentTarget.value)}
            onBlur={() => passwordForm.validateField("old_password")}
            error={passwordForm.errors.old_password as string | undefined}
          />
          <PasswordInput
            label="New Password"
            withAsterisk
            value={passwordForm.values.new_password}
            onChange={(e) => passwordForm.setFieldValue("new_password", e.currentTarget.value)}
            onBlur={() => passwordForm.validateField("new_password")}
            error={passwordForm.errors.new_password as string | undefined}
          />
          {newPasswordValue.length > 0 && (
            <Box>
              <Group gap={5} grow mb={4}>
                {passwordBars}
              </Group>
              <PasswordRequirement
                label="Has at least 8 characters"
                meets={newPasswordValue.length >= 8}
              />
              {passwordRequirements.map((req) => (
                <PasswordRequirement
                  key={req.label}
                  label={req.label}
                  meets={req.re.test(newPasswordValue)}
                />
              ))}
            </Box>
          )}
          <PasswordInput
            label="Confirm New Password"
            withAsterisk
            value={passwordForm.values.confirm_password}
            onChange={(e) => passwordForm.setFieldValue("confirm_password", e.currentTarget.value)}
            onBlur={() => passwordForm.validateField("confirm_password")}
            error={passwordForm.errors.confirm_password as string | undefined}
          />
          <Divider />
          <Group justify="flex-end">
            <Button variant="default" onClick={handleClosePasswordModal} disabled={savingPassword}>
              Cancel
            </Button>
            <Button
              color="#4EAE4A"
              onClick={() => void handleChangePassword()}
              loading={savingPassword}
              disabled={!passwordForm.isValid() || savingPassword}
            >
              Change Password
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ── About ─────────────────────────────────────────────────────────── */}
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" mb="sm" align="flex-start" wrap="wrap">
          <Text fw={700} c="#298925">
            About
          </Text>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconPencil size={14} />}
            onClick={openEditModal}
            fullWidth={isMobile}
          >
            Edit Profile
          </Button>
        </Group>

        <Stack gap="xs">
          <Group gap="xs" align="flex-start">
            <Text size="sm" fw={600}>First Name:</Text>
            <Text size="sm">{profile.first_name}</Text>
          </Group>
          <Group gap="xs" align="flex-start">
            <Text size="sm" fw={600}>Middle Name:</Text>
            <Text size="sm" c={profile.middle_name ? undefined : "dimmed"}>
              {profile.middle_name || <i>—</i>}
            </Text>
          </Group>
          <Group gap="xs" align="flex-start">
            <Text size="sm" fw={600}>Last Name:</Text>
            <Text size="sm">{profile.last_name}</Text>
          </Group>
          <Group gap="xs" align="flex-start">
            <Text size="sm" fw={600}>Email:</Text>
            <Text size="sm" style={{ overflowWrap: "anywhere" }}>{profile.email}</Text>
          </Group>
        </Stack>
      </Paper>

      {/* ── Roles ─────────────────────────────────────────────────────────── */}
      <Paper withBorder p="md" radius="md">
        <Text fw={700} c="#298925" mb="sm">
          Roles{" "}
          <Text span size="xs" c="dimmed" fw={400}>
            (read-only)
          </Text>
        </Text>

        {profile.roles.length === 0 ? (
          <Text size="sm" c="dimmed">
            No roles assigned.
          </Text>
        ) : (
          <Stack gap="xs">
            {profile.roles.map((role, index) => (
              <Group key={role.role_id} gap="sm">
                <Box
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 4,
                    backgroundColor: "#e9ecef",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text size="xs" fw={600} c="dimmed">
                    {index + 1}
                  </Text>
                </Box>
                <Text size="sm" style={{ overflowWrap: "anywhere" }}>{role.name}</Text>
              </Group>
            ))}
          </Stack>
        )}
      </Paper>

      {/* ── Password ──────────────────────────────────────────────────────── */}
      <Paper withBorder p="md" radius="md">
        <Text fw={700} c="#298925" mb="sm">
          Password
        </Text>
        <Button
          color="#4EAE4A"
          size="sm"
          onClick={() => setPasswordModalOpened(true)}
          fullWidth={isMobile}
        >
          Change Password
        </Button>
      </Paper>
    </Stack>
  );
}
