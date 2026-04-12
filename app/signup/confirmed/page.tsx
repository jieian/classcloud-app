"use client";

import {
  Alert,
  Button,
  Container,
  Group,
  Loader,
  Paper,
  Text,
  TextInput,
  ThemeIcon,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconCheck, IconMailForward } from "@tabler/icons-react";
import CircleBackground from "@/components/circleBackground/circleBackground";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import classes from "@/components/loginPage/LoginPage.module.css";

type PageState =
  | "loading"
  | "success"
  | "already_verified"
  | "expired"
  | "invalid"
  | "not_found"
  | "error";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUpConfirmedPage() {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");

  // Resend state (used on 'expired' page state)
  const [resendEmail, setResendEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [confirmedEmail, setConfirmedEmail] = useState("");
  const [resendSent, setResendSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Confirm (called once on mount) ───────────────────────────────────────
  const runConfirm = async (token: string) => {
    try {
      const res = await fetch("/api/auth/signup/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data?.error ?? "Something went wrong. Please try again.");
        setPageState("error");
        return;
      }

      const status = data?.status as PageState | undefined;
      if (status === "expired" && data?.maskedEmail) {
        setMaskedEmail(data.maskedEmail);
        if (data?.email) setConfirmedEmail(data.email);
      }
      setPageState(status ?? "error");
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
      setPageState("error");
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setPageState("not_found");
      return;
    }

    // Clean token from URL bar (single-use; no need to expose it)
    window.history.replaceState(null, "", window.location.pathname);

    void runConfirm(token);

    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // ── Resend cooldown ticker ───────────────────────────────────────────────
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

  // ── Resend handler ───────────────────────────────────────────────────────
  const handleResend = async () => {
    const email = (confirmedEmail || resendEmail).trim().toLowerCase();
    if (!email || !EMAIL_REGEX.test(email)) {
      notifications.show({
        title: "Invalid Email",
        message: "Please enter a valid email address.",
        color: "red",
      });
      return;
    }

    setResendLoading(true);
    try {
      const res = await fetch("/api/auth/signup/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data?.code === "MAX_RESENDS_EXCEEDED") {
          notifications.show({
            title: "Maximum Resends Reached",
            message: "You've reached the limit. Please sign up again.",
            color: "orange",
            autoClose: false,
          });
          setPageState("not_found"); // reuse the "sign up again" UI
          return;
        }
        if (data?.code === "NOT_FOUND" || data?.code === "EXPIRED") {
          notifications.show({
            title: "Link Expired",
            message: "Your signup has expired. Please sign up again.",
            color: "orange",
          });
          setPageState("not_found");
          return;
        }
        notifications.show({
          title: "Resend Failed",
          message: data?.error ?? "Something went wrong. Please try again.",
          color: data?.code === "EMAIL_DELIVERY_FAILED" ? "yellow" : "red",
          autoClose: data?.code === "EMAIL_DELIVERY_FAILED" ? false : 5000,
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

  return (
    <CircleBackground>
      <div className={classes.centerWrapper}>
        <Container size={480} w="100%">
          <div className={classes.cardEntrance}>
            <Paper withBorder shadow="md" p={32} radius="lg" w="100%">
              {/* Logo */}
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

              {/* ── Loading ── */}
              {pageState === "loading" && (
                <Group justify="center" py="xl">
                  <Loader color="#4EAE4A" />
                </Group>
              )}

              {/* ── Success ── */}
              {pageState === "success" && (
                <>
                  <Group justify="center" mb="md">
                    <ThemeIcon color="teal" size={64} radius="xl" variant="light">
                      <IconCheck size={36} stroke={2} />
                    </ThemeIcon>
                  </Group>
                  <Text ta="center" fw={700} fz="lg" c="#45903B" mb="xs">
                    Email Verified!
                  </Text>
                  <Text ta="center" size="sm" c="#555" mb="lg">
                    Your email has been confirmed. An administrator will review
                    your account — you&apos;ll be notified once you&apos;re approved.
                  </Text>
                  <Link href="/login" style={{ textDecoration: "none" }}>
                    <Text ta="center" size="sm" c="#4EAE4A">
                      ← Back to login page
                    </Text>
                  </Link>
                </>
              )}

              {/* ── Already verified ── */}
              {pageState === "already_verified" && (
                <>
                  <Group justify="center" mb="md">
                    <ThemeIcon color="teal" size={64} radius="xl" variant="light">
                      <IconCheck size={36} stroke={2} />
                    </ThemeIcon>
                  </Group>
                  <Text ta="center" fw={700} fz="lg" c="#45903B" mb="xs">
                    Already Verified
                  </Text>
                  <Text ta="center" size="sm" c="#555" mb="lg">
                    This link has already been used. Your account is awaiting
                    administrator approval.
                  </Text>
                  <Link href="/login" style={{ textDecoration: "none" }}>
                    <Text ta="center" size="sm" c="#4EAE4A">
                      ← Back to login page
                    </Text>
                  </Link>
                </>
              )}

              {/* ── Expired ── */}
              {pageState === "expired" && (
                <>
                  <Alert
                    color="orange"
                    radius="md"
                    mb="md"
                    icon={<IconAlertCircle size={16} />}
                  >
                    This verification link has expired.
                    {maskedEmail && (
                      <> It was sent to <strong>{maskedEmail}</strong>.</>
                    )}
                  </Alert>

                  {resendSent ? (
                    <>
                      <Group justify="center" mb="md">
                        <ThemeIcon color="teal" size={48} radius="xl" variant="light">
                          <IconMailForward size={24} stroke={2} />
                        </ThemeIcon>
                      </Group>
                      <Text ta="center" size="sm" c="#555" mb="lg">
                        A new verification email has been sent. Check your inbox.
                      </Text>
                    </>
                  ) : confirmedEmail ? (
                    <>
                      <Button
                        fullWidth
                        radius="md"
                        color="#4EAE4A"
                        loading={resendLoading}
                        disabled={resendCooldown > 0}
                        onClick={handleResend}
                        mb="sm"
                      >
                        {resendCooldown > 0
                          ? `Resend in ${resendCooldown}s`
                          : "Resend Verification Email"}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Text size="sm" c="#555" mb="xs">
                        Enter your email address to receive a new verification link.
                      </Text>
                      <TextInput
                        placeholder="you@baliuagu.edu.ph"
                        type="email"
                        radius="md"
                        mb="sm"
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !resendLoading && resendCooldown === 0)
                            void handleResend();
                        }}
                        classNames={{
                          input: classes.greenInputBorder,
                        }}
                      />
                      <Button
                        fullWidth
                        radius="md"
                        color="#4EAE4A"
                        loading={resendLoading}
                        disabled={resendCooldown > 0}
                        onClick={handleResend}
                        mb="sm"
                      >
                        {resendCooldown > 0
                          ? `Resend in ${resendCooldown}s`
                          : "Resend Verification Email"}
                      </Button>
                    </>
                  )}

                </>
              )}

              {/* ── Invalid ── */}
              {pageState === "invalid" && (
                <>
                  <Alert
                    color="red"
                    radius="md"
                    mb="md"
                    icon={<IconAlertCircle size={16} />}
                  >
                    This link is invalid. A newer verification email may have been
                    sent — check your inbox.
                  </Alert>
                  <Link href="/signup" style={{ textDecoration: "none" }}>
                    <Text ta="center" size="sm" c="#808898">
                      Sign up again
                    </Text>
                  </Link>
                </>
              )}

              {/* ── Not found / already used ── */}
              {pageState === "not_found" && (
                <>
                  <Alert
                    color="red"
                    radius="md"
                    mb="md"
                    icon={<IconAlertCircle size={16} />}
                  >
                    This verification link has already been used or has expired.
                  </Alert>
                  <Group justify="space-between">
                    <Link href="/login" style={{ textDecoration: "none" }}>
                      <Text size="sm" c="#808898">
                        ← Back to login
                      </Text>
                    </Link>
                    <Link href="/signup" style={{ textDecoration: "none" }}>
                      <Text size="sm" c="#4EAE4A">
                        Sign up again
                      </Text>
                    </Link>
                  </Group>
                </>
              )}

              {/* ── Error ── */}
              {pageState === "error" && (
                <>
                  <Alert
                    color="red"
                    radius="md"
                    mb="md"
                    icon={<IconAlertCircle size={16} />}
                  >
                    {errorMessage || "Something went wrong. Please try again."}
                  </Alert>
                  <Group justify="space-between">
                    <Link href="/login" style={{ textDecoration: "none" }}>
                      <Text size="sm" c="#808898">
                        ← Back to login
                      </Text>
                    </Link>
                    <Button
                      radius="md"
                      color="#4EAE4A"
                      onClick={() => window.location.reload()}
                    >
                      Try Again
                    </Button>
                  </Group>
                </>
              )}
            </Paper>
          </div>
        </Container>
      </div>
    </CircleBackground>
  );
}
