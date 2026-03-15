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
} from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import CircleBackground from "@/components/circleBackground/circleBackground";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { notify } from "@/components/notificationIcon/notificationIcon";
import classes from "@/components/loginPage/LoginPage.module.css";
import {
  getPasswordStrength,
  passwordRequirements,
} from "@/app/(app)/user-roles/users/_lib/utils";

type PageState = "loading" | "ready" | "invalid";

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

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = getSupabase();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmError, setConfirmError] = useState("");

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
        color={
          passwordStrength > 80
            ? "teal"
            : passwordStrength > 50
              ? "yellow"
              : "red"
        }
        size={4}
        aria-label={`Password strength segment ${index + 1}`}
      />
    ));

  const allRequirementsMet =
    password.length >= 8 &&
    passwordRequirements.every((req) => req.re.test(password));

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

              {pageState === "loading" && (
                <Text c="#808898" ta="center" mt="md">
                  Verifying your reset link...
                </Text>
              )}

              {pageState === "invalid" && (
                <Alert color="red" mt="md" radius="md">
                  This password reset link is invalid or has expired. Please
                  request a new one.
                </Alert>
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
