"use client";

import {
  Box,
  Button,
  Center,
  Container,
  Group,
  Paper,
  PasswordInput,
  Progress,
  Text,
  Alert,
  ThemeIcon,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconX, IconMailForward, IconAlertCircle } from "@tabler/icons-react";
import Link from "next/link";
import CircleBackground from "@/components/circleBackground/circleBackground";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { notify } from "@/components/notificationIcon/notificationIcon";
import classes from "@/components/loginPage/LoginPage.module.css";
import {
  getPasswordStrength,
  passwordRequirements,
} from "@/app/(app)/user-roles/users/_lib/utils";

type PageState = "loading" | "ready" | "invalid";

function decodeJwtEmail(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return decoded?.email ?? null;
  } catch {
    return null;
  }
}

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

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = getSupabase();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  // Resend state (used on 'invalid' page state)
  const [emailFromToken, setEmailFromToken] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = () => {
    setResendCooldown(60);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResend = async () => {
    if (!emailFromToken) return;

    setResendLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailFromToken }),
      });
      const data = await res.json();

      if (!res.ok) {
        notifications.show({
          title: "Resend Failed",
          message: data?.error ?? "Something went wrong. Please try again.",
          color: "red",
        });
        return;
      }

      setResendSent(true);
      startCooldown();
    } catch {
      notifications.show({
        title: "Resend Failed",
        message: "Something went wrong. Please try again.",
        color: "red",
      });
    } finally {
      setResendLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      // Check existing session first (page refresh case)
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setPageState("ready");
        return;
      }

      // Parse implicit flow token from URL hash
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = params.get("type");

      if (accessToken && refreshToken && type === "recovery") {
        // Decode email from JWT before attempting session (token may be expired)
        setEmailFromToken(decodeJwtEmail(accessToken));

        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error) {
          setPageState("ready");
          window.history.replaceState(null, "", window.location.pathname);
        } else {
          setPageState("invalid");
        }
      } else {
        setPageState("invalid");
      }
    })();

    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, [supabase]);

  const passwordStrength = getPasswordStrength(password);

  const passwordBars = Array(4)
    .fill(0)
    .map((_, index) => (
      <Progress
        key={index}
        styles={{ section: { transitionDuration: "0ms" } }}
        value={
          password.length > 0 && index === 0
            ? 100
            : passwordStrength >= ((index + 1) / 4) * 100
              ? 100
              : 0
        }
        color={passwordStrength > 80 ? "teal" : passwordStrength > 50 ? "yellow" : "red"}
        size={4}
        aria-label={`Password strength segment ${index + 1}`}
      />
    ));

  const allRequirementsMet =
    password.length >= 8 && passwordRequirements.every((req) => req.re.test(password));

  const canSubmit = allRequirementsMet && confirmPassword === password;

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setConfirmError("");

    if (!allRequirementsMet) return;

    if (password !== confirmPassword) {
      setConfirmError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        notify({ title: "Error", message: error.message, type: "error" });
        return;
      }

      await supabase.auth.signOut();
      notify({
        title: "Password updated",
        message: "Your password has been reset. Please log in.",
        type: "success",
      });
      router.push("/");
    } finally {
      setLoading(false);
    }
  };

  return (
    <CircleBackground>
      <div className={classes.centerWrapper}>
        <Container size={500} w="100%">
          <div className={classes.cardEntrance}>
            <Paper withBorder shadow="md" p={32} radius="lg" w="100%">
              <Group gap={6} align="center" mb="lg">
                <img
                  src="/logo/CCLogo.png"
                  alt="ClassCloud Logo"
                  className={classes.logo}
                />
                <Text className={classes.classCloud}>
                  <span>
                    <span style={{ color: "#45903B" }}>Class</span>
                    <span style={{ color: "#076E3F" }}>Cloud</span>
                  </span>
                </Text>
              </Group>

              {pageState === "loading" && (
                <Text c="#808898" ta="center" mt="md">
                  Verifying your reset link...
                </Text>
              )}

              {pageState === "invalid" && (
                <>
                  <Alert
                    color="orange"
                    radius="md"
                    mb="md"
                    icon={<IconAlertCircle size={16} />}
                  >
                    This password reset link is invalid or has expired.
                  </Alert>

                  {resendSent ? (
                    <>
                      <Group justify="center" mb="md">
                        <ThemeIcon color="teal" size={48} radius="xl" variant="light">
                          <IconMailForward size={24} stroke={2} />
                        </ThemeIcon>
                      </Group>
                      <Text ta="center" size="sm" c="#555" mb="sm">
                        A new reset link has been sent. Check your inbox.
                      </Text>
                      <Button
                        fullWidth
                        radius="md"
                        color="#4EAE4A"
                        disabled={resendCooldown > 0}
                        loading={resendLoading}
                        onClick={handleResend}
                        mb="sm"
                      >
                        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Reset Link"}
                      </Button>
                    </>
                  ) : emailFromToken ? (
                    <Button
                      fullWidth
                      radius="md"
                      color="#4EAE4A"
                      loading={resendLoading}
                      disabled={resendCooldown > 0}
                      onClick={handleResend}
                      mb="sm"
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Send New Reset Link"}
                    </Button>
                  ) : null}

                  <Link href="/forgot-password" style={{ textDecoration: "none" }}>
                    <Text size="sm" c="#808898" ta="center">
                      ← Request a new link
                    </Text>
                  </Link>
                </>
              )}

              {pageState === "ready" && (
                <>
                  <Text
                    ta="center"
                    fw={750}
                    className={`${classes.greenColor} ${classes.welcomeText}`}
                  >
                    Reset Password
                  </Text>
                  <p className="mb-3 text-sm text-[#808898]">
                    Enter a new password for your ClassCloud account.
                  </p>

                  <form onSubmit={handleSubmit}>
                    <PasswordInput
                      label="New Password"
                      placeholder="Your password"
                      required
                      radius="md"
                      value={password}
                      onChange={(e) => setPassword(e.currentTarget.value)}
                      classNames={{
                        label: classes.blackInputLabel,
                        input: classes.greenInputBorder,
                      }}
                    />

                    {password.length > 0 && (
                      <Box mt="xs">
                        <Group gap={5} grow mb="md">
                          {passwordBars}
                        </Group>

                        <PasswordRequirement
                          label="Has at least 6 characters"
                          meets={password.length >= 8}
                        />
                        {passwordRequirements.map((req, index) => (
                          <PasswordRequirement
                            key={index}
                            label={req.label}
                            meets={req.re.test(password)}
                          />
                        ))}
                      </Box>
                    )}

                    <div>
                      <PasswordInput
                        label="Confirm Password"
                        placeholder="Re-enter your new password"
                        required
                        mt="md"
                        radius="md"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.currentTarget.value)}
                        error={confirmError}
                        classNames={{
                          label: classes.blackInputLabel,
                          input: classes.greenInputBorder,
                        }}
                      />
                      {confirmPassword.length > 0 && confirmPassword !== password && (
                        <Text size="xs" c="red" mt={5}>
                          Passwords do not match.
                        </Text>
                      )}
                    </div>
                    <Button
                      type="submit"
                      fullWidth
                      mt="md"
                      radius="md"
                      color="#4EAE4A"
                      loading={loading}
                      disabled={!canSubmit}
                    >
                      Update Password
                    </Button>
                  </form>
                </>
              )}
            </Paper>
          </div>
        </Container>
      </div>
    </CircleBackground>
  );
}
