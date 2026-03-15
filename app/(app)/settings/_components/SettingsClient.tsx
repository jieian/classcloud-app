"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCheck,
  IconInfoCircle,
  IconLock,
  IconPencil,
  IconX,
} from "@tabler/icons-react";
import { useAuth } from "@/context/AuthContext";

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

const NAME_REGEX = /^[a-zA-Z][a-zA-Z']*(?:\s[a-zA-Z][a-zA-Z']*)*$/;

export default function SettingsClient() {
  const router = useRouter();
  const { refreshUserName } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    validateInputOnChange: true,
    initialValues: { first_name: "", middle_name: "", last_name: "" },
    validate: {
      first_name: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return "First name is required";
        if (trimmed.length > 100)
          return "First name must be 100 characters or less";
        if (!NAME_REGEX.test(trimmed))
          return "First name must contain only letters and apostrophes (no extra spaces)";
        return null;
      },
      middle_name: (value) => {
        if (!value) return null;
        const trimmed = value.trim();
        if (trimmed.length > 100)
          return "Middle name must be 100 characters or less";
        if (!NAME_REGEX.test(trimmed))
          return "Middle name must contain only letters and apostrophes (no extra spaces)";
        return null;
      },
      last_name: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return "Last name is required";
        if (trimmed.length > 100)
          return "Last name must be 100 characters or less";
        if (!NAME_REGEX.test(trimmed))
          return "Last name must contain only letters and apostrophes (no extra spaces)";
        return null;
      },
    },
  });

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

  // Intercept NavBar link clicks while in edit mode with unsaved changes
  useEffect(() => {
    if (!isEditMode || !form.isDirty()) return;

    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href")!;
      if (/^(https?:|#|mailto:|tel:)/.test(href)) return;

      e.preventDefault();
      e.stopPropagation();

      modals.openConfirmModal({
        title: "Discard changes?",
        centered: true,
        children: (
          <Text size="sm">
            You have unsaved changes. Are you sure you want to leave?
          </Text>
        ),
        labels: { confirm: "Discard", cancel: "Stay" },
        confirmProps: { color: "red" },
        onConfirm: () => {
          form.reset();
          setIsEditMode(false);
          router.push(href);
        },
      });
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isEditMode, form.isDirty()]);

  const enterEditMode = () => {
    if (!profile) return;
    form.setValues({
      first_name: profile.first_name,
      middle_name: profile.middle_name,
      last_name: profile.last_name,
    });
    form.resetDirty();
    setIsEditMode(true);
  };

  const handleDiscard = () => {
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
        setIsEditMode(false);
      },
    });
  };

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
      title: "Save changes?",
      centered: true,
      children: (
        <Text size="sm">
          Are you sure you want to save the changes to your profile?
        </Text>
      ),
      labels: { confirm: "Save", cancel: "Cancel" },
      confirmProps: { color: "#4EAE4A" },
      onConfirm: async () => {
        await submitSave();
      },
    });
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

      // Update AuthContext so the NavBar name reflects the change immediately
      await refreshUserName();

      notifications.show({
        title: "Success",
        message: "Profile updated successfully.",
        color: "green",
      });

      form.reset();
      setIsEditMode(false);
    } catch (e) {
      notifications.show({
        title: "Error",
        message: e instanceof Error ? e.message : "Failed to save changes.",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  // Renders the "!" tooltip icon shown inside the TextInput when there is an error
  const errorSection = (errorMsg: string | undefined) =>
    errorMsg ? (
      <Tooltip
        label={errorMsg}
        position="top"
        multiline
        w={220}
        events={{ hover: true, focus: true, touch: true }}
      >
        <ActionIcon variant="transparent" color="red" size="sm">
          <IconAlertCircle size={16} />
        </ActionIcon>
      </Tooltip>
    ) : null;

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Stack gap="md" maw={680}>
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
      {/* ── About ─────────────────────────────────────────────────────────── */}
      <Paper withBorder p="md" radius="md">
        {/* Header row — always visible */}
        <Group justify="space-between" mb="sm">
          <Text fw={700} c="#298925">
            About
          </Text>
          {!isEditMode && (
            <Button
              size="xs"
              variant="default"
              leftSection={<IconPencil size={14} />}
              onClick={enterEditMode}
            >
              Edit Profile
            </Button>
          )}
        </Group>

        {/* View mode — fields only */}
        {!isEditMode && (
          <Stack gap="xs">
            <Group gap="xs">
              <Text size="sm" fw={600}>First Name:</Text>
              <Text size="sm">{profile.first_name}</Text>
            </Group>
            <Group gap="xs">
              <Text size="sm" fw={600}>Middle Name:</Text>
              <Text size="sm" c={profile.middle_name ? undefined : "dimmed"}>
                {profile.middle_name || <i>—</i>}
              </Text>
            </Group>
            <Group gap="xs">
              <Text size="sm" fw={600}>Last Name:</Text>
              <Text size="sm">{profile.last_name}</Text>
            </Group>
            <Group gap="xs">
              <Text size="sm" fw={600}>Email:</Text>
              <Text size="sm">{profile.email}</Text>
            </Group>
          </Stack>
        )}

        {/* Edit mode — inputs on left, Save/Discard buttons on right */}
        {isEditMode && (
          <Group align="flex-start" justify="space-between" gap="md">
            <Stack gap={8} style={{ flex: 1 }}>
            {/* First Name */}
            <Group gap="xs" align="center" wrap="nowrap">
              <Text
                size="sm"
                fw={600}
                style={{ width: 96, flexShrink: 0 }}
              >
                First Name:
              </Text>
              <TextInput
                size="xs"
                style={{ flex: 1 }}
                value={form.values.first_name}
                onChange={(e) =>
                  form.setFieldValue("first_name", e.currentTarget.value)
                }
                onBlur={() => form.validateField("first_name")}
                error={form.errors.first_name ? true : undefined}
                styles={{ error: { display: "none" } }}
                rightSection={errorSection(
                  form.errors.first_name as string | undefined,
                )}
              />
            </Group>

            {/* Middle Name */}
            <Group gap="xs" align="center" wrap="nowrap">
              <Text
                size="sm"
                fw={600}
                style={{ width: 96, flexShrink: 0 }}
              >
                Middle Name:
              </Text>
              <TextInput
                size="xs"
                style={{ flex: 1 }}
                placeholder="(optional)"
                value={form.values.middle_name}
                onChange={(e) =>
                  form.setFieldValue("middle_name", e.currentTarget.value)
                }
                onBlur={() => form.validateField("middle_name")}
                error={form.errors.middle_name ? true : undefined}
                styles={{ error: { display: "none" } }}
                rightSection={errorSection(
                  form.errors.middle_name as string | undefined,
                )}
              />
            </Group>

            {/* Last Name */}
            <Group gap="xs" align="center" wrap="nowrap">
              <Text
                size="sm"
                fw={600}
                style={{ width: 96, flexShrink: 0 }}
              >
                Last Name:
              </Text>
              <TextInput
                size="xs"
                style={{ flex: 1 }}
                value={form.values.last_name}
                onChange={(e) =>
                  form.setFieldValue("last_name", e.currentTarget.value)
                }
                onBlur={() => form.validateField("last_name")}
                error={form.errors.last_name ? true : undefined}
                styles={{ error: { display: "none" } }}
                rightSection={errorSection(
                  form.errors.last_name as string | undefined,
                )}
              />
            </Group>

            {/* Email (read-only) */}
            <Group gap="xs" align="center" wrap="nowrap">
              <Text
                size="sm"
                fw={600}
                style={{ width: 96, flexShrink: 0 }}
              >
                Email:
              </Text>
              <Text size="sm" c="dimmed">
                {profile.email}
              </Text>
              <Tooltip
                label="Email cannot be changed here. Contact your administrator to update it."
                position="top"
                multiline
                w={220}
                events={{ hover: true, focus: true, touch: true }}
              >
                <ActionIcon variant="subtle" color="blue" size="sm">
                  <IconInfoCircle size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Stack>

          {/* Save / Discard buttons — right column */}
          <Stack gap={6} pt={2}>
            <Button
              size="xs"
              color="#4EAE4A"
              leftSection={<IconCheck size={14} />}
              onClick={handleSave}
              loading={saving}
              disabled={!form.isDirty() || !form.isValid()}
            >
              Save Changes
            </Button>
            <Button
              size="xs"
              color="red"
              variant="outline"
              leftSection={<IconX size={14} />}
              onClick={handleDiscard}
              disabled={saving}
            >
              Discard Changes
            </Button>
          </Stack>
        </Group>
        )}
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
                <Text size="sm">{role.name}</Text>
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
          leftSection={<IconLock size={16} />}
          size="sm"
          disabled
        >
          Change Password
        </Button>
      </Paper>
    </Stack>
  );
}
