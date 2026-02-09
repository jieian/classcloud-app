"use client";

/**
 * Login Page Component
 * Updated to use Supabase client directly instead of AuthContext
 * AuthContext is only available in authenticated routes
 */

import {
  Button,
  Checkbox,
  Container,
  Group,
  Paper,
  PasswordInput,
  TextInput,
  Text,
  Blockquote,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
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
  const supabase = getSupabase();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) throw authError;

      // Show success notification
      notify({
        title: "Login successful",
        message: "Welcome Back!",
        type: "success",
      });

      // Redirect to home
      router.push("/");
    } catch (authError: any) {
      setError(true);
      notify({
        title: "Login failed",
        message: authError.message,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const icon = <IconInfoCircle />;

  return (
    <>
      <CircleBackground>
        <div className={classes.centerWrapper}>
          <Container size={500}>
            <Paper withBorder shadow="sm" p={22} radius="md">
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
                Welcome back to ClassCloud!
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
                    label: classes.greenInputLabel,
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
                    label: classes.greenInputLabel,
                    input: error
                      ? classes.redInputBorder
                      : classes.greenInputBorder,
                  }}
                />
                <Group justify="space-between" mt="lg">
                  <Checkbox
                    label="Remember me"
                    color="#45903B"
                    className={classes.greenColor}
                  />
                </Group>
                <Button
                  type="submit"
                  fullWidth
                  mt="xl"
                  radius="md"
                  color="#4EAE4A"
                  loading={loading}
                >
                  Sign in
                </Button>
              </form>
            </Paper>

            <Blockquote
              color="#2F421F"
              iconSize={30}
              icon={icon}
              mt="xl"
              className={classes.blockQuote}
            >
              <Text fw={550}>Forgot Password?</Text>
              <br />
              Approach your School Head or designated school system
              administrator to reset password.
            </Blockquote>
          </Container>
        </div>
      </CircleBackground>
    </>
  );
}
