"use client";

/**
 * Login Page Component
 * Updated to use Supabase client directly instead of AuthContext
 * AuthContext is only available in authenticated routes
 */

import {
  Anchor,
  Button,
  Checkbox,
  Container,
  Group,
  Paper,
  PasswordInput,
  TextInput,
  Text,
} from "@mantine/core";
import classes from "./LoginPage.module.css";

import CircleBackground from "@/components/circleBackground/circleBackground";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { notify } from "@/components/notificationIcon/notificationIcon";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shaking, setShaking] = useState(false);

  const triggerShake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  };
  const supabase = getSupabase();
  const invalidCredentialsMessage = "User credentials don't exist.";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    setLoading(true);

    try {
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (authError) throw authError;

      // Check if the account is activated and not soft-deleted
      const { data: userData } = await supabase
        .from("users")
        .select("active_status, deleted_at")
        .eq("uid", authData.user.id)
        .maybeSingle();

      if (!userData) {
        await supabase.auth.signOut();
        notify({
          title: "Login failed",
          message: invalidCredentialsMessage,
          type: "error",
        });
        return;
      }

      if (userData.deleted_at) {
        await supabase.auth.signOut();
        notify({
          title: "Login failed",
          message: invalidCredentialsMessage,
          type: "error",
        });
        return;
      }

      if (userData.active_status === 0) {
        await supabase.auth.signOut();
        notify({
          title: "Account Pending Approval",
          message:
            "Your account has not been activated yet. Please contact your administrator.",
          type: "info",
          autoClose: 8000,
        });
        return;
      }

      // Show success notification
      notify({
        title: "Login successful",
        message: "Welcome Back!",
        type: "success",
      });

      const requestedNext =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next")
          : null;
      const safeNext =
        requestedNext &&
        requestedNext.startsWith("/") &&
        !requestedNext.startsWith("//")
          ? requestedNext
          : "/";

      // Redirect back to requested page when provided.
      router.push(safeNext);
    } catch (authError: unknown) {
      // Check if this email belongs to a pending account
      try {
        const res = await fetch("/api/auth/check-pending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        });
        const { pending } = await res.json();

        if (pending) {
          notify({
            title: "Account Pending Approval",
            message:
              "Your account has not been activated yet. Please contact your administrator.",
            type: "info",
            autoClose: 8000,
          });
          return;
        }
      } catch {
        // If the check fails, fall through to the normal error
      }

      setError(true);
      triggerShake();
      const errorMessage =
        authError instanceof Error ? authError.message : "Login failed";
      const isBannedError = errorMessage.toLowerCase().includes("banned");
      notify({
        title: "Login failed",
        message: isBannedError ? invalidCredentialsMessage : errorMessage,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <CircleBackground>
        <div className={classes.centerWrapper}>
          <Container size={500} w="100%">
            <div className={classes.cardEntrance}>
              <Paper
                withBorder
                shadow="md"
                p={32}
                radius="lg"
                w="100%"
                className={shaking ? classes.shake : ""}
              >
                <Group gap={6} align="center">
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
                <Text
                  ta="center"
                  fw={750}
                  className={`${classes.greenColor} ${classes.welcomeText}`}
                >
                  Welcome to ClassCloud!
                </Text>

                <form onSubmit={handleLogin}>
                  <TextInput
                    label="Email"
                    placeholder="you@example.com"
                    required
                    radius="md"
                    value={email}
                    onChange={(e) => setEmail(e.currentTarget.value)}
                    classNames={{
                      label: classes.blackInputLabel,
                      input: error
                        ? classes.redInputBorder
                        : classes.greenInputBorder,
                    }}
                  />

                  <PasswordInput
                    label="Password"
                    placeholder="Your password"
                    required
                    mt="md"
                    radius="md"
                    value={password}
                    onChange={(e) => setPassword(e.currentTarget.value)}
                    classNames={{
                      label: classes.blackInputLabel,
                      input: error
                        ? classes.redInputBorder
                        : classes.greenInputBorder,
                    }}
                  />
                  <Group justify="space-between" mt="lg">
                    <Checkbox label="Remember me" color="#45903B" />
                    <Anchor href="" size="sm" c="#4EAE4A">
                      Forgot password?
                    </Anchor>
                  </Group>
                  <Button
                    type="submit"
                    fullWidth
                    mt="md"
                    radius="md"
                    color="#4EAE4A"
                    loading={loading}
                  >
                    Login
                  </Button>
                </form>
              </Paper>
              <Text ta="center" mt="md" c="#3a5c35" className={classes.signUpText}>
                Don&apos;t have an account?{" "}
                <Anchor c="#4EAE4A" fw={600} href="" underline="hover" fz="inherit">
                  Sign Up
                </Anchor>
              </Text>
            </div>
          </Container>
        </div>
      </CircleBackground>
    </>
  );
}
