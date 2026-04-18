"use client";

import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  PasswordInput,
  Progress,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconX } from "@tabler/icons-react";
import { getSupabase } from "@/lib/supabase/client";
import {
  getPasswordStrength,
  passwordRequirements,
} from "@/app/(app)/user-roles/users/_lib/utils";
import { changePasswordForced } from "@/app/(app)/user-roles/users/_lib";

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

export default function MustChangePasswordModal() {
  const [opened, setOpened] = useState(false);
  const [checking, setChecking] = useState(false);
  const [step, setStep] = useState<"welcome" | "change">("welcome");

  // Change password form state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const strength = getPasswordStrength(newPassword);
  const meetsAllRequirements =
    newPassword.length >= 8 &&
    passwordRequirements.every((r) => r.re.test(newPassword));
  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit =
    meetsAllRequirements && passwordsMatch && confirmPassword !== "";

  const passwordBars = Array(4)
    .fill(0)
    .map((_, index) => (
      <Progress
        key={index}
        styles={{ section: { transitionDuration: "0ms" } }}
        value={
          newPassword.length > 0 && index === 0
            ? 100
            : strength >= ((index + 1) / 4) * 100
              ? 100
              : 0
        }
        color={strength > 80 ? "teal" : strength > 50 ? "yellow" : "red"}
        size={4}
        aria-label={`Password strength segment ${index + 1}`}
      />
    ));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("welcome") !== "1") return;

    window.history.replaceState(null, "", window.location.pathname);
    void checkMustChange();
  }, []);

  const checkMustChange = async () => {
    try {
      setChecking(true);
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("users")
        .select("must_change_password")
        .eq("uid", user.id)
        .maybeSingle();

      if (data?.must_change_password === true) {
        setOpened(true);
      }
    } catch {
      // Non-fatal
    } finally {
      setChecking(false);
    }
  };

  // Block all navbar/link navigation while the modal is open
  useEffect(() => {
    if (!opened) return;

    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href")!;
      if (/^(https?:|#|mailto:|tel:)/.test(href)) return;
      e.preventDefault();
      e.stopPropagation();
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [opened]);

  const handleChangePassword = async () => {
    if (!canSubmit) return;
    try {
      setSaving(true);
      await changePasswordForced(newPassword);
      notifications.show({
        title: "Password Changed",
        message: "Your password has been updated successfully.",
        color: "green",
      });
      setOpened(false);
    } catch (err) {
      notifications.show({
        title: "Error",
        message:
          err instanceof Error ? err.message : "Failed to change password.",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  if (checking) return null;

  return (
    <Modal
      opened={opened}
      onClose={() => {}}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      centered
      size="lg"
      padding="xl"
    >
      {/* Logo */}
      <Group justify="center" mb="md">
        <img
          src="/logo/CCLogo.png"
          alt="ClassCloud Logo"
          style={{ maxWidth: 64, height: "auto" }}
        />
      </Group>

      {step === "welcome" && (
        <>
          <Text ta="center" fw={700} fz="xl" c="#45903B" mb={8}>
            Welcome to ClassCloud!
          </Text>
          <Text ta="center" size="md" c="#808898" mb="xl">
            Your account has been set up by an administrator. Your first step is
            to change your temporary password before you can start using the
            system.
          </Text>
          <Button
            fullWidth
            size="md"
            radius="md"
            style={{ backgroundColor: "#4EAE4A" }}
            onClick={() => setStep("change")}
          >
            Change Password
          </Button>
        </>
      )}

      {step === "change" && (
        <>
          <Text ta="center" fw={700} fz="xl" c="#45903B" mb={8}>
            Change Your Password
          </Text>
          <Text ta="center" size="md" c="#808898" mb="lg">
            Create a new password to continue.
          </Text>

          <PasswordInput
            label="New Password"
            placeholder="Enter new password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.currentTarget.value)}
            mb="xs"
          />

          <Group gap={5} grow mb="xs">
            {passwordBars}
          </Group>

          <PasswordRequirement
            label="Has at least 8 characters"
            meets={newPassword.length >= 8}
          />
          {passwordRequirements.map((req, i) => (
            <PasswordRequirement
              key={i}
              label={req.label}
              meets={req.re.test(newPassword)}
            />
          ))}

          <PasswordInput
            label="Confirm New Password"
            placeholder="Repeat new password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.currentTarget.value)}
            mt="md"
            mb="xs"
            error={
              confirmPassword && !passwordsMatch
                ? "Passwords do not match"
                : undefined
            }
          />

          <Button
            fullWidth
            mt="lg"
            radius="md"
            style={canSubmit ? { backgroundColor: "#4EAE4A" } : undefined}
            disabled={!canSubmit}
            loading={saving}
            onClick={handleChangePassword}
          >
            Change Password
          </Button>
        </>
      )}
    </Modal>
  );
}
