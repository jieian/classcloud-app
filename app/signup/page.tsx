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
  SimpleGrid,
  Text,
  TextInput,
} from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import CircleBackground from "@/components/circleBackground/circleBackground";
import Link from "next/link";
import { useState } from "react";
import classes from "@/components/loginPage/LoginPage.module.css";
import { notify } from "@/components/notificationIcon/notificationIcon";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const passwordRequirements = [
  { re: /[0-9]/, label: "Includes number" },
  { re: /[a-z]/, label: "Includes lowercase letter" },
  { re: /[A-Z]/, label: "Includes uppercase letter" },
  { re: /[$&+,:;=?@#|'<>.^*()%!-]/, label: "Includes special symbol" },
];

function getPasswordStrength(password: string): number {
  let multiplier = password.length >= 6 ? 0 : 1;
  passwordRequirements.forEach((requirement) => {
    if (!requirement.re.test(password)) multiplier += 1;
  });
  return Math.max(
    100 - (100 / (passwordRequirements.length + 1)) * multiplier,
    0,
  );
}

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

export default function SignUpPage() {
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [shaking, setShaking] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [confirmError, setConfirmError] = useState("");

  const triggerShake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  };

  const strength = getPasswordStrength(password);
  const strengthColor =
    strength > 80 ? "teal" : strength > 50 ? "yellow" : "red";
  const meetsLength = password.length >= 6;
  const allMet =
    meetsLength && passwordRequirements.every((r) => r.re.test(password));

  const isFormValid =
    firstName.trim() !== "" &&
    lastName.trim() !== "" &&
    EMAIL_REGEX.test(email.trim()) &&
    allMet &&
    password === confirmPassword;

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEmailError("");
    setConfirmError("");

    if (password !== confirmPassword) {
      setConfirmError("Passwords do not match");
      triggerShake();
      return;
    }

    if (!allMet) {
      triggerShake();
      notify({
        title: "Weak password",
        message: "Please meet all password requirements before submitting.",
        type: "error",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          middle_name: middleName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setEmailError("This email is already registered.");
          triggerShake();
          return;
        }
        triggerShake();
        notify({
          title: "Sign up failed",
          message: data.error ?? "Something went wrong. Please try again.",
          type: "error",
        });
        return;
      }

      setSubmittedEmail(email.trim());
      setSubmitted(true);
    } catch {
      triggerShake();
      notify({
        title: "Sign up failed",
        message: "Something went wrong. Please try again.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const passwordBars = Array(4)
    .fill(0)
    .map((_, index) => (
      <Progress
        key={index}
        styles={{ section: { transitionDuration: "0ms" } }}
        value={
          password.length > 0 && index === 0
            ? 100
            : strength >= ((index + 1) / 4) * 100
              ? 100
              : 0
        }
        color={strengthColor}
        size={4}
        aria-label={`Password strength segment ${index + 1}`}
      />
    ));

  return (
    <CircleBackground>
      <div className={classes.centerWrapper}>
        <Container size={620} w="100%">
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
                Create an Account
              </Text>

              {submitted ? (
                <>
                  <Text size="sm" c="#555" mb="xs">
                    A verification link has been sent to{" "}
                    <strong>{submittedEmail}</strong>. Click the link in your
                    inbox to confirm your email — your account will then be
                    reviewed by an administrator before you can log in.
                  </Text>
                  <Link href="/login" style={{ textDecoration: "none" }}>
                    <Text size="sm" c="#4EAE4A" mt="md">
                      ← Back to login page
                    </Text>
                  </Link>
                </>
              ) : (
                <form onSubmit={handleSubmit}>
                  {/* Demographic Profile */}
                  <Text fw={600} c="#45903B" size="sm" mb="xs">
                    Demographic Profile
                  </Text>
                  <SimpleGrid cols={3} mb="md">
                    <TextInput
                      label="First Name"
                      placeholder="Juan"
                      required
                      radius="md"
                      value={firstName}
                      onChange={(e) => setFirstName(e.currentTarget.value)}
                      classNames={{
                        label: classes.blackInputLabel,
                        input: classes.greenInputBorder,
                      }}
                    />
                    <TextInput
                      label="Middle Name"
                      placeholder="(Optional)"
                      radius="md"
                      value={middleName}
                      onChange={(e) => setMiddleName(e.currentTarget.value)}
                      classNames={{
                        label: classes.blackInputLabel,
                        input: classes.greenInputBorder,
                      }}
                    />
                    <TextInput
                      label="Last Name"
                      placeholder="Dela Cruz"
                      required
                      radius="md"
                      value={lastName}
                      onChange={(e) => setLastName(e.currentTarget.value)}
                      classNames={{
                        label: classes.blackInputLabel,
                        input: classes.greenInputBorder,
                      }}
                    />
                  </SimpleGrid>

                  {/* Account Information */}
                  <Text fw={600} c="#45903B" size="sm" mb="xs">
                    Account Information
                  </Text>
                  <TextInput
                    label="Email"
                    placeholder="you@email.com"
                    type="email"
                    required
                    radius="md"
                    mb="md"
                    value={email}
                    error={emailError}
                    onChange={(e) => {
                      setEmail(e.currentTarget.value);
                      setEmailError("");
                    }}
                    classNames={{
                      label: classes.blackInputLabel,
                      input: emailError
                        ? classes.redInputBorder
                        : classes.greenInputBorder,
                    }}
                  />

                  <SimpleGrid cols={2} mb="xs">
                    <div>
                      <PasswordInput
                        label="Password"
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
                      {/* Strength bars — constrained to password column width */}
                      <Group gap={5} grow mt="xs" mb={4}>
                        {passwordBars}
                      </Group>
                      <PasswordRequirement
                        label="Has at least 6 characters"
                        meets={meetsLength}
                      />
                      {passwordRequirements.map((req, i) => (
                        <PasswordRequirement
                          key={i}
                          label={req.label}
                          meets={req.re.test(password)}
                        />
                      ))}
                    </div>
                    <div>
                      <PasswordInput
                        label="Confirm Password"
                        placeholder="Your password"
                        required
                        radius="md"
                        value={confirmPassword}
                        error={confirmError}
                        onChange={(e) => {
                          setConfirmPassword(e.currentTarget.value);
                          setConfirmError("");
                        }}
                        classNames={{
                          label: classes.blackInputLabel,
                          input: confirmError
                            ? classes.redInputBorder
                            : classes.greenInputBorder,
                        }}
                      />
                      {confirmPassword.length > 0 && confirmPassword !== password && (
                        <Text size="xs" c="red" mt={5}>
                          Passwords do not match.
                        </Text>
                      )}
                    </div>
                  </SimpleGrid>

                  <Group justify="space-between" mt="lg">
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
                      disabled={!isFormValid}
                    >
                      Create Account
                    </Button>
                  </Group>
                </form>
              )}
            </Paper>
          </div>
        </Container>
      </div>
    </CircleBackground>
  );
}
