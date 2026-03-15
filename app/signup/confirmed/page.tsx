"use client";

import {
  Container,
  Loader,
  Paper,
  Text,
  ThemeIcon,
  Group,
  Alert,
  Button,
} from "@mantine/core";
import { IconCheck, IconAlertCircle } from "@tabler/icons-react";
import CircleBackground from "@/components/circleBackground/circleBackground";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import classes from "@/components/loginPage/LoginPage.module.css";

type PageState = "loading" | "success" | "error" | "invalid";

export default function SignUpConfirmedPage() {
  const supabase = getSupabase();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [retrying, setRetrying] = useState(false);

  const runConfirm = async () => {
    const res = await fetch("/api/auth/signup/confirm", { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      setErrorMessage(data.error ?? "Something went wrong. Please try again.");
      setPageState("error");
      return;
    }

    // Sign out — account is pending approval, they can't use the app yet
    await supabase.auth.signOut();
    setPageState("success");
  };

  useEffect(() => {
    void (async () => {
      // Check existing session first (e.g. page refresh after confirmation)
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await runConfirm();
        return;
      }

      // Parse implicit flow tokens from URL hash (Supabase email link redirect)
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = params.get("type");

      if (accessToken && refreshToken && type === "signup") {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          setPageState("invalid");
          return;
        }

        // Clear the tokens from the URL
        window.history.replaceState(null, "", window.location.pathname);
        await runConfirm();
        return;
      }

      // No valid token found
      setPageState("invalid");
    })();
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    setPageState("loading");
    await runConfirm();
    setRetrying(false);
  };

  return (
    <CircleBackground>
      <div className={classes.centerWrapper}>
        <Container size={480} w="100%">
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
                <Group justify="center" py="xl">
                  <Loader color="#4EAE4A" />
                </Group>
              )}

              {pageState === "success" && (
                <>
                  <Group justify="center" mb="md">
                    <ThemeIcon
                      color="teal"
                      size={64}
                      radius="xl"
                      variant="light"
                    >
                      <IconCheck size={36} stroke={2} />
                    </ThemeIcon>
                  </Group>
                  <Text
                    ta="center"
                    fw={700}
                    fz="lg"
                    c="#45903B"
                    mb="xs"
                  >
                    Email Verified!
                  </Text>
                  <Text ta="center" size="sm" c="#555" mb="lg">
                    Your email has been confirmed. An administrator will review
                    your account — you&apos;ll be notified once you&apos;re
                    approved.
                  </Text>
                  <Link href="/login" style={{ textDecoration: "none" }}>
                    <Text ta="center" size="sm" c="#4EAE4A">
                      ← Back to login page
                    </Text>
                  </Link>
                </>
              )}

              {pageState === "error" && (
                <>
                  <Alert
                    color="red"
                    radius="md"
                    mb="md"
                    icon={<IconAlertCircle size={16} />}
                  >
                    {errorMessage}
                  </Alert>
                  <Group justify="space-between">
                    <Link href="/login" style={{ textDecoration: "none" }}>
                      <Text size="sm" c="#808898">
                        ← Back to login page
                      </Text>
                    </Link>
                    <Button
                      radius="md"
                      color="#4EAE4A"
                      loading={retrying}
                      onClick={handleRetry}
                    >
                      Try Again
                    </Button>
                  </Group>
                </>
              )}

              {pageState === "invalid" && (
                <>
                  <Alert color="red" radius="md" mb="md" icon={<IconAlertCircle size={16} />}>
                    This verification link is invalid or has already been used.
                  </Alert>
                  <Link href="/login" style={{ textDecoration: "none" }}>
                    <Text size="sm" c="#808898">
                      ← Back to login page
                    </Text>
                  </Link>
                </>
              )}
            </Paper>
          </div>
        </Container>
      </div>
    </CircleBackground>
  );
}
