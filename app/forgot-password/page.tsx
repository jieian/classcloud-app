"use client";

import { Button, Container, Paper, Text, TextInput, ThemeIcon, Group } from "@mantine/core";
import CircleBackground from "@/components/circleBackground/circleBackground";
import Link from "next/link";
import { useState } from "react";
import classes from "@/components/loginPage/LoginPage.module.css";
import { notify } from "@/components/notificationIcon/notificationIcon";
import { IconMailForward } from "@tabler/icons-react";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);

  const isValidEmail = EMAIL_REGEX.test(email.trim());

  const triggerShake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(false);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const { error: errMsg } = await res.json();
        setError(true);
        triggerShake();
        notify({
          title: "Request failed",
          message: errMsg ?? "Something went wrong. Please try again.",
          type: "error",
        });
        return;
      }

      setSent(true);
    } catch {
      setError(true);
      triggerShake();
      notify({
        title: "Request failed",
        message: "Something went wrong. Please try again.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <CircleBackground>
      <div className={classes.centerWrapper}>
        <Container size={480} w="100%">
          <div className={classes.cardEntrance}>
            <Text ta="center" fw={800} fz={28} c="#45903B" mb={10}>
              Forgot your password?
            </Text>
            <Text ta="center" c="#808898" fz="sm" mb="xl">
              Enter your email to get a reset link
            </Text>

            <Paper
              withBorder
              shadow="md"
              p={32}
              radius="lg"
              w="100%"
              className={shaking ? classes.shake : ""}
            >
              {sent ? (
                <>
                  <Group justify="center" mb="md">
                    <ThemeIcon color="teal" size={48} radius="xl" variant="light">
                      <IconMailForward size={24} stroke={2} />
                    </ThemeIcon>
                  </Group>
                  <Text size="sm" c="#555" mb="md">
                    A password reset link has been sent to{" "}
                    <strong>{email}</strong>. Check your inbox.
                  </Text>
                  <Link href="/login" style={{ textDecoration: "none" }}>
                    <Text size="sm" c="#4EAE4A" ta="center">
                      ← Back to login page
                    </Text>
                  </Link>
                </>
              ) : (
                <form onSubmit={handleSubmit}>
                  <TextInput
                    label="Email"
                    placeholder="you@email.com"
                    type="email"
                    required
                    radius="md"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.currentTarget.value);
                      setError(false);
                    }}
                    classNames={{
                      label: classes.blackInputLabel,
                      input: error
                        ? classes.redInputBorder
                        : classes.greenInputBorder,
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: "1.5rem",
                    }}
                  >
                    <Link href="/login" style={{ textDecoration: "none" }}>
                      <Text size="sm" c="#808898">
                        ← Back to login page
                      </Text>
                    </Link>
                    <Button
                      type="submit"
                      radius="md"
                      color="#4EAE4A"
                      loading={loading}
                      disabled={!isValidEmail}
                    >
                      Send Code
                    </Button>
                  </div>
                </form>
              )}
            </Paper>
          </div>
        </Container>
      </div>
    </CircleBackground>
  );
}
