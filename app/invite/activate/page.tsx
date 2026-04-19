"use client";

import {
  Alert,
  Button,
  Container,
  Group,
  Loader,
  Paper,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { IconAlertCircle, IconCheck, IconInfoCircle } from "@tabler/icons-react";

import CircleBackground from "@/components/circleBackground/circleBackground";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import classes from "@/components/loginPage/LoginPage.module.css";

type PageState = "loading" | "success" | "already_used" | "invalid" | "error";

interface ActivationData {
  first_name: string;
  full_name: string;
  email: string;
  tempPassword: string;
  role_names: string[];
}

export default function ActivateInvitePage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [activationData, setActivationData] = useState<ActivationData | null>(
    null,
  );
  const [loggingIn, setLoggingIn] = useState(false);
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setPageState("invalid");
      return;
    }

    // Remove token from URL bar immediately (single-use)
    window.history.replaceState(null, "", window.location.pathname);

    void activate(token);
  }, []);

  const activate = async (token: string) => {
    try {
      const res = await fetch("/api/users/activate-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data?.error === "invalid") {
          setPageState("invalid");
        } else if (data?.error === "already_used") {
          setPageState("already_used");
        } else {
          setErrorMessage(
            data?.error ?? "Something went wrong. Please try again.",
          );
          setPageState("error");
        }
        return;
      }

      setActivationData({
        first_name: data.first_name,
        full_name: data.full_name,
        email: data.email,
        tempPassword: data.tempPassword,
        role_names: data.role_names ?? [],
      });
      setPageState("success");
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
      setPageState("error");
    }
  };

  const handleLogin = async () => {
    if (!activationData) return;
    try {
      setLoggingIn(true);
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithPassword({
        email: activationData.email,
        password: activationData.tempPassword,
      });
      if (error) throw error;
      // must_change_password is true for all invited users — go to welcome flow
      router.push("/?welcome=1");
    } catch {
      setErrorMessage(
        "Login failed. Please go to the login page and sign in manually.",
      );
      setPageState("error");
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <CircleBackground>
      <div className={classes.centerWrapper}>
        <Container size={520} w="100%">
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

              {/* Loading */}
              {pageState === "loading" && (
                <Group justify="center" py="xl">
                  <Loader color="#4EAE4A" />
                  <Text size="sm" c="#808898">
                    Activating your account…
                  </Text>
                </Group>
              )}

              {/* Success */}
              {pageState === "success" && activationData && (
                <>
                  <Group justify="center" mb="md">
                    <ThemeIcon color="#4EAE4A" size={64} radius="xl" variant="filled">
                      <IconCheck size={36} stroke={2} />
                    </ThemeIcon>
                  </Group>

                  <Text ta="center" fw={700} fz="xl" c="#45903B" mb={4}>
                    Welcome to ClassCloud, {activationData.first_name}!
                  </Text>
                  <Text ta="center" size="md" c="#808898" mb="lg">
                    Your account has been activated successfully.
                  </Text>

                  <Alert
                    icon={<IconInfoCircle size={16} />}
                    color="yellow"
                    radius="md"
                    mb="md"
                    styles={{ message: { fontSize: "var(--mantine-font-size-sm)" } }}
                  >
                    You must change your password on first login.
                  </Alert>

                  <Button
                    fullWidth
                    radius="md"
                    style={{ backgroundColor: "#4EAE4A" }}
                    loading={loggingIn}
                    onClick={handleLogin}
                  >
                    Log In
                  </Button>
                </>
              )}

              {/* Already used */}
              {pageState === "already_used" && (
                <>
                  <Group justify="center" mb="md">
                    <ThemeIcon color="#4EAE4A" size={64} radius="xl" variant="filled">
                      <IconCheck size={36} stroke={2} />
                    </ThemeIcon>
                  </Group>
                  <Text ta="center" fw={700} fz="lg" c="#45903B" mb="xs">
                    Already Activated
                  </Text>
                  <Text ta="center" size="sm" c="#808898" mb="lg">
                    This account has already been activated. Proceed to login.
                  </Text>
                  <Link href="/login" style={{ textDecoration: "none" }}>
                    <Button
                      fullWidth
                      radius="md"
                      style={{ backgroundColor: "#4EAE4A" }}
                    >
                      Go to Login
                    </Button>
                  </Link>
                </>
              )}

              {/* Invalid */}
              {pageState === "invalid" && (
                <>
                  <Alert
                    color="red"
                    radius="md"
                    mb="md"
                    icon={<IconAlertCircle size={16} />}
                  >
                    This invitation link is invalid or has already been used.
                  </Alert>
                  <Link href="/login" style={{ textDecoration: "none" }}>
                    <Text ta="center" size="sm" c="#4EAE4A">
                      ← Back to login
                    </Text>
                  </Link>
                </>
              )}

              {/* Error */}
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
