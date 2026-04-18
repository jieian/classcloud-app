"use client";

import {
  Alert,
  Box,
  Button,
  Center,
  Checkbox,
  Container,
  Group,
  Loader,
  Pagination,
  Paper,
  PasswordInput,
  Progress,
  SimpleGrid,
  Stack,
  Stepper,
  Text,
  TextInput,
  ThemeIcon,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconMailCheck, IconMailForward, IconX } from "@tabler/icons-react";
import CircleBackground from "@/components/circleBackground/circleBackground";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import classes from "@/components/loginPage/LoginPage.module.css";
import { sortRoles } from "@/lib/roleUtils";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

const ALLOWED_DOMAINS = ["baliuagu.edu.ph", "gmail.com", "deped.gov.ph"];
const domainAllowed = (e: string) => ALLOWED_DOMAINS.some((d) => e.toLowerCase().endsWith(`@${d}`));
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const passwordRequirements = [
  { re: /[0-9]/, label: "Includes number" },
  { re: /[a-z]/, label: "Includes lowercase letter" },
  { re: /[A-Z]/, label: "Includes uppercase letter" },
  { re: /[$&+,:;=?@#|'<>.^*()%!-]/, label: "Includes special symbol" },
];

function getPasswordStrength(password: string): number {
  let multiplier = password.length >= 6 ? 0 : 1;
  passwordRequirements.forEach((req) => {
    if (!req.re.test(password)) multiplier += 1;
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

interface Role {
  role_id: number;
  name: string;
  is_faculty: boolean;
  is_protected: boolean;
}

const ROLES_PER_PAGE = 3;

type EmailCheckStatus =
  | "idle"
  | "checking"
  | "available"
  | "active"
  | "deleted"
  | "pending_verification";

export default function SignUpPage() {
  const [step, setStep] = useState(0);

  // ── Step 1 ──
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailCheckStatus, setEmailCheckStatus] =
    useState<EmailCheckStatus>("idle");
  const checkedEmailRef = useRef<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmError, setConfirmError] = useState("");

  // ── Step 2 ──
  const [firstName, setFirstName] = useState("");
  const [firstNameError, setFirstNameError] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [middleNameError, setMiddleNameError] = useState("");
  const [lastName, setLastName] = useState("");
  const [lastNameError, setLastNameError] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [rolesError, setRolesError] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [rolePage, setRolePage] = useState(1);
  const sortedRoles = sortRoles(roles);

  // ── Honeypot ──
  const [honeypot, setHoneypot] = useState("");

  // ── Turnstile ──
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

  // ── Submit ──
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [shaking, setShaking] = useState(false);

  // ── Resend (used when emailCheckStatus === 'pending_verification') ──
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const triggerShake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  };

  const NAME_REGEX = /^[a-zA-Z][a-zA-Z']*(?:\s[a-zA-Z][a-zA-Z']*)*$/;

  const validateFirstName = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "First name is required";
    if (trimmed.length > 100) return "First name must be 100 characters or less";
    if (!NAME_REGEX.test(trimmed)) return "First name must contain only letters";
    return "";
  };

  const validateMiddleName = (value: string) => {
    if (!value) return "";
    const trimmed = value.trim();
    if (trimmed.length > 100) return "Middle name must be 100 characters or less";
    if (!NAME_REGEX.test(trimmed)) return "Middle name must contain only letters";
    return "";
  };

  const validateLastName = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "Last name is required";
    if (trimmed.length > 100) return "Last name must be 100 characters or less";
    if (!NAME_REGEX.test(trimmed)) return "Last name must contain only letters";
    return "";
  };

  const startCooldown = useCallback(() => {
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
  }, []);

  const handleResend = async () => {
    const trimmed = email.trim();
    setResendLoading(true);
    try {
      const res = await fetch("/api/auth/signup/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data?.code === "MAX_RESENDS_EXCEEDED") {
          notifications.show({
            title: "Maximum Resends Reached",
            message: "You've reached the resend limit. Please sign up again.",
            color: "orange",
            autoClose: false,
          });
          // Reset so the user can fill the form again
          setEmailCheckStatus("idle");
          checkedEmailRef.current = null;
          setResendSent(false);
          setResendCooldown(0);
          return;
        }
        if (data?.code === "NOT_FOUND" || data?.code === "EXPIRED") {
          notifications.show({
            title: "Session Expired",
            message: "Your previous signup expired. Please sign up again.",
            color: "orange",
          });
          setEmailCheckStatus("idle");
          checkedEmailRef.current = null;
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

  const handleStartOver = () => {
    setEmail("");
    setEmailError("");
    setEmailCheckStatus("idle");
    checkedEmailRef.current = null;
    setPassword("");
    setConfirmPassword("");
    setResendSent(false);
    setResendCooldown(0);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    setTurnstileToken(null);
    turnstileRef.current?.reset();
  };

  const strength = getPasswordStrength(password);
  const strengthColor =
    strength > 80 ? "teal" : strength > 50 ? "yellow" : "red";
  const meetsLength = password.length >= 6;
  const allPasswordMet =
    meetsLength && passwordRequirements.every((r) => r.re.test(password));
  const isStep1Valid =
    EMAIL_REGEX.test(email.trim()) &&
    domainAllowed(email.trim()) &&
    allPasswordMet &&
    confirmPassword === password &&
    confirmPassword.length > 0;

  // Cleanup cooldown interval on unmount
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // Load self-registrable roles on mount
  useEffect(() => {
    setLoadingRoles(true);
    fetch("/api/auth/roles")
      .then((res) => res.json())
      .then((data) => setRoles(data.data ?? []))
      .catch(() => {
        notifications.show({
          title: "Error Loading Roles",
          message: "Failed to load available roles. Please refresh the page.",
          color: "red",
        });
      })
      .finally(() => setLoadingRoles(false));
  }, []);

  // ── Email check (called on blur or during Next) ──
  const runEmailCheck = async (
    emailToCheck: string,
  ): Promise<EmailCheckStatus> => {
    setEmailCheckStatus("checking");
    setEmailError("");
    try {
      const res = await fetch(
        `/api/auth/check-email?email=${encodeURIComponent(emailToCheck)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        if (data?.error) {
          notifications.show({
            title: "Email Check Failed",
            message: data.error,
            color: "red",
          });
        }
        setEmailCheckStatus("idle");
        return "idle";
      }
      const status = data.status as EmailCheckStatus;
      checkedEmailRef.current = emailToCheck.toLowerCase();
      setEmailCheckStatus(status === "pending_verification" ? "active" : status);
      if (status === "active") {
        setEmailError("This email is already registered.");
      }
      if (status === "pending_verification") {
        setEmailError("A verification email was already sent to this address. Check your inbox.");
      }
      return status;
    } catch {
      setEmailCheckStatus("idle");
      return "idle";
    }
  };

  const handleEmailBlur = () => {
    const trimmed = email.trim();
    if (!trimmed) return;

    if (!domainAllowed(trimmed)) {
      setEmailError(`Email must end with @deped.gov.ph.`);
      return;
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setEmailError("Invalid email format.");
      return;
    }
    // Skip if already checked this exact address
    if (checkedEmailRef.current === trimmed.toLowerCase()) return;

    void runEmailCheck(trimmed);
  };

  // ── Next: validates Step 1 and advances ──
  const handleNext = async () => {
    setEmailError("");
    setConfirmError("");

    const trimmed = email.trim();

    if (!domainAllowed(trimmed)) {
      setEmailError(`Email must end with @deped.gov.ph.`);
      triggerShake();
      return;
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setEmailError("Invalid email format.");
      triggerShake();
      return;
    }
    if (!allPasswordMet) {
      triggerShake();
      notifications.show({
        title: "Weak Password",
        message: "Please meet all password requirements before proceeding.",
        color: "red",
      });
      return;
    }
    if (password !== confirmPassword) {
      setConfirmError("Passwords do not match.");
      triggerShake();
      return;
    }

    // Run email check inline if not yet done for this address
    let status = emailCheckStatus;
    if (checkedEmailRef.current !== trimmed.toLowerCase()) {
      status = await runEmailCheck(trimmed);
    }

    if (status === "idle") {
      notifications.show({
        title: "Error",
        message: "Failed to verify email. Please try again.",
        color: "red",
      });
      return;
    }
    if (status === "active") {
      setEmailError("This email is already registered.");
      triggerShake();
      return;
    }
    if (status === "pending_verification") {
      setEmailError("A verification email was already sent to this address. Check your inbox.");
      triggerShake();
      return;
    }

    setStep(1);
  };

  // ── Submit: validates Step 2 and calls the API ──
  const handleSubmit = async () => {
    setRolesError("");

    const fnErr = validateFirstName(firstName);
    const mnErr = validateMiddleName(middleName);
    const lnErr = validateLastName(lastName);
    setFirstNameError(fnErr);
    setMiddleNameError(mnErr);
    setLastNameError(lnErr);
    if (fnErr || mnErr || lnErr) {
      triggerShake();
      return;
    }

    if (selectedRoles.length === 0) {
      setRolesError("Please select at least one role.");
      triggerShake();
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
          role_ids: selectedRoles.map(Number),
          website: honeypot,
          turnstile_token: turnstileToken,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          if (data.code === "PENDING_VERIFICATION") {
            setEmailError("A verification email was already sent to this address. Check your inbox.");
            setStep(0);
            return;
          }
          setEmailError("This email is already registered.");
          setStep(0);
          triggerShake();
          return;
        }
        setTurnstileToken(null);
        turnstileRef.current?.reset();
        triggerShake();
        notifications.show({
          title: "Sign Up Failed",
          message: data.error ?? "Something went wrong. Please try again.",
          color: data.code === "EMAIL_DELIVERY_FAILED" ? "yellow" : "red",
          autoClose: data.code === "EMAIL_DELIVERY_FAILED" ? false : 5000,
        });
        return;
      }

      setSubmittedEmail(email.trim());
      setSubmitted(true);
    } catch {
      setTurnstileToken(null);
      turnstileRef.current?.reset();
      triggerShake();
      notifications.show({
        title: "Sign Up Failed",
        message: "Something went wrong. Please try again.",
        color: "red",
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
        <Container size={660} w="100%">
          <div className={classes.cardEntrance}>
            <Paper
              withBorder
              shadow="md"
              p={32}
              radius="lg"
              w="100%"
              className={shaking ? classes.shake : ""}
            >
              {/* ── Logo ── */}
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

{/* ── Success state ── */}
              {submitted ? (
                <>
                  <Group justify="center" mb="md">
                    <ThemeIcon
                      color="#4EAE4A"
                      size={64}
                      radius="xl"
                      variant="filled"
                    >
                      <IconMailCheck size={36} stroke={2} />
                    </ThemeIcon>
                  </Group>
                  <Text ta="center" fw={700} fz="lg" c="#45903B" mb="xs">
                    Check Your Inbox!
                  </Text>
                  <Text ta="center" size="sm" c="#555" mb="lg">
                    A verification link has been sent to{" "}
                    <strong>{submittedEmail}</strong>.{" "}
                    <br />
                    Click the link in your inbox to verify your email.
                  </Text>
                  <Link href="/login" style={{ textDecoration: "none" }}>
                    <Text ta="center" size="sm" c="#808898">
                      ← Back to login page
                    </Text>
                  </Link>
                </>
              ) : (
                <>
                  {/* ── Honeypot ── */}
                  <div style={{ position: "absolute", left: "-9999px", top: "-9999px" }} aria-hidden="true">
                    <input
                      type="text"
                      name="website"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.currentTarget.value)}
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </div>

                  {/* ── Step indicator ── */}
                  <Stepper
                    active={step}
                    color="#4EAE4A"
                    size="sm"
                    mt="md"
                    mb="xl"
                  >
                    <Stepper.Step
                      label="Account"
                      description="Email & password"
                    />
                    <Stepper.Step
                      label="Profile"
                      description="Your info & roles"
                    />
                  </Stepper>

                  {/* ══════════════ STEP 1 ══════════════ */}
                  {step === 0 && (
                    <div
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          isStep1Valid &&
                          emailCheckStatus !== "checking"
                        )
                          handleNext();
                      }}
                    >
                      <Text fw={600} c="#45903B" size="sm" mb="xs">
                        Account Information
                      </Text>

                      {/* Email */}
                      <TextInput
                        label="Email"
                        placeholder="you@deped.gov.ph"
                        type="email"
                        required
                        radius="md"
                        mb={4}
                        value={email}
                        error={emailError}
                        rightSection={
                          emailCheckStatus === "checking" ? (
                            <Loader size="xs" color="#4EAE4A" />
                          ) : undefined
                        }
                        onChange={(e) => {
                          const val = e.currentTarget.value;
                          setEmail(val);
                          setEmailError("");
                          // Reset check state when the email value changes
                          if (
                            checkedEmailRef.current !== val.trim().toLowerCase()
                          ) {
                            setEmailCheckStatus("idle");
                            checkedEmailRef.current = null;
                          }
                        }}
                        onBlur={handleEmailBlur}
                        classNames={{
                          label: classes.blackInputLabel,
                          input: emailError
                            ? classes.redInputBorder
                            : classes.greenInputBorder,
                        }}
                      />

                      {/* Password */}
                      <SimpleGrid cols={2} mt="md" mb="xs">
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
                          {confirmPassword.length > 0 &&
                            confirmPassword !== password && (
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
                          radius="md"
                          color="#4EAE4A"
                          loading={emailCheckStatus === "checking"}
                          disabled={!isStep1Valid}
                          onClick={handleNext}
                        >
                          Next
                        </Button>
                      </Group>
                    </div>
                  )}

                  {/* ══════════════ STEP 2 ══════════════ */}
                  {step === 1 && (
                    <div
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !loading &&
                          firstName.trim() &&
                          lastName.trim() &&
                          selectedRoles.length > 0
                        )
                          handleSubmit();
                      }}
                    >
                      {/* Demographic Profile */}
                      <Text fw={600} c="#45903B" size="sm" mb="xs">
                        Demographic Profile
                      </Text>
                      <SimpleGrid cols={3} mb="lg">
                        <TextInput
                          label="First Name"
                          placeholder="Juan"
                          required
                          radius="md"
                          value={firstName}
                          error={firstNameError}
                          onChange={(e) => {
                            setFirstName(e.currentTarget.value);
                            setFirstNameError("");
                          }}
                          onBlur={() => setFirstNameError(validateFirstName(firstName))}
                          classNames={{
                            label: classes.blackInputLabel,
                            input: firstNameError ? classes.redInputBorder : classes.greenInputBorder,
                          }}
                        />
                        <TextInput
                          label="Middle Name"
                          placeholder="(Optional)"
                          radius="md"
                          value={middleName}
                          error={middleNameError}
                          onChange={(e) => {
                            setMiddleName(e.currentTarget.value);
                            setMiddleNameError("");
                          }}
                          onBlur={() => setMiddleNameError(validateMiddleName(middleName))}
                          classNames={{
                            label: classes.blackInputLabel,
                            input: middleNameError ? classes.redInputBorder : classes.greenInputBorder,
                          }}
                        />
                        <TextInput
                          label="Last Name"
                          placeholder="Dela Cruz"
                          required
                          radius="md"
                          value={lastName}
                          error={lastNameError}
                          onChange={(e) => {
                            setLastName(e.currentTarget.value);
                            setLastNameError("");
                          }}
                          onBlur={() => setLastNameError(validateLastName(lastName))}
                          classNames={{
                            label: classes.blackInputLabel,
                            input: lastNameError ? classes.redInputBorder : classes.greenInputBorder,
                          }}
                        />
                      </SimpleGrid>

                      {/* Requested Roles */}
                      <Text fw={600} c="#45903B" size="sm" mb={2}>
                        Requested Roles{" "}
                        <Text span c="red" inherit>
                          *
                        </Text>
                      </Text>
                      <p className="mb-3 text-sm text-[#808898]">
                        Select the role(s) you are requesting. Final role(s)
                        assignment is at the administrator's discretion.
                      </p>
                      {loadingRoles ? (
                        <Center py="md">
                          <Loader size="sm" color="#4EAE4A" />
                        </Center>
                      ) : roles.length === 0 ? (
                        <Text size="sm" c="#808898" ta="center" py="md">
                          No roles are currently available for
                          self-registration.
                        </Text>
                      ) : (
                        (() => {
                          // Compute which selected role names fit within a
                          // character budget before rendering.
                          const selectedRoleNames = selectedRoles
                            .map(
                              (id) =>
                                roles.find((r) => r.role_id.toString() === id)
                                  ?.name,
                            )
                            .filter((n): n is string => Boolean(n));

                          const CHAR_BUDGET = 55;
                          const displayedRoleNames: string[] = [];
                          let used = 0;
                          for (const name of selectedRoleNames) {
                            const cost =
                              used > 0 ? name.length + 2 : name.length;
                            if (used > 0 && used + cost > CHAR_BUDGET) break;
                            displayedRoleNames.push(name);
                            used += cost;
                          }
                          const hiddenRolesCount =
                            selectedRoleNames.length -
                            displayedRoleNames.length;

                          return (
                            <>
                              <Box
                                p="md"
                                style={{
                                  border: rolesError
                                    ? "1px solid var(--mantine-color-red-5)"
                                    : "1px solid #d3e9d0",
                                  borderRadius: "var(--mantine-radius-md)",
                                  backgroundColor: "#f0f7ee",
                                }}
                              >
                                <Checkbox.Group
                                  value={selectedRoles}
                                  onChange={(val) => {
                                    setSelectedRoles(val);
                                    setRolesError("");
                                  }}
                                >
                                  <Stack gap={4} style={{ minHeight: 95 }}>
                                    {sortedRoles
                                      .slice(
                                        (rolePage - 1) * ROLES_PER_PAGE,
                                        rolePage * ROLES_PER_PAGE,
                                      )
                                      .map((role) => {
                                        const isSelected =
                                          selectedRoles.includes(
                                            role.role_id.toString(),
                                          );
                                        return (
                                          <Box
                                            key={role.role_id}
                                            px="xs"
                                            py={6}
                                            style={{
                                              borderRadius:
                                                "var(--mantine-radius-sm)",
                                              backgroundColor: isSelected
                                                ? "#d3e9d0"
                                                : "transparent",
                                              transition:
                                                "background-color 0.15s",
                                            }}
                                          >
                                            <Checkbox
                                              value={role.role_id.toString()}
                                              color="#4EAE4A"
                                              label={
                                                <Text size="sm">
                                                  {role.name}
                                                </Text>
                                              }
                                            />
                                          </Box>
                                        );
                                      })}
                                  </Stack>
                                </Checkbox.Group>

                                {/* Pagination — centered */}
                                {sortedRoles.length > ROLES_PER_PAGE && (
                                  <Group justify="center" mt="sm">
                                    <Pagination
                                      value={rolePage}
                                      onChange={setRolePage}
                                      total={Math.ceil(
                                        sortedRoles.length / ROLES_PER_PAGE,
                                      )}
                                      size="xs"
                                      color="#4EAE4A"
                                    />
                                  </Group>
                                )}
                              </Box>

                              {/* Selected roles summary below the box */}
                              {selectedRoleNames.length > 0 && (
                                <Text size="xs" c="#808898" mt={6}>
                                  <Text span fw={600} c="#45903B">
                                    Selected Roles ({selectedRoleNames.length}
                                    ):{" "}
                                  </Text>
                                  {displayedRoleNames.length === 2 && hiddenRolesCount === 0
                                    ? `${displayedRoleNames[0]} and ${displayedRoleNames[1]}`
                                    : displayedRoleNames.join(", ")}
                                  {hiddenRolesCount > 0 && (
                                    <Text span fw={500} c="#4EAE4A">
                                      {" "}
                                      +{hiddenRolesCount} more
                                    </Text>
                                  )}
                                </Text>
                              )}

                              {rolesError && (
                                <Text size="xs" c="red" mt={4}>
                                  {rolesError}
                                </Text>
                              )}
                            </>
                          );
                        })()
                      )}

                      <Turnstile
                        ref={turnstileRef}
                        style={{ marginTop: "1.5rem" }}
                        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                        onSuccess={(token) => setTurnstileToken(token)}
                        onError={() => setTurnstileToken(null)}
                        onExpire={() => setTurnstileToken(null)}
                        options={{ appearance: "interaction-only", theme: "light" }}
                      />

                      <Group justify="space-between" mt="lg">
                        <Button
                          variant="default"
                          radius="md"
                          onClick={() => setStep(0)}
                          style={{ color: "#808898" }}
                        >
                          Back
                        </Button>
                        <Button
                          radius="md"
                          color="#4EAE4A"
                          loading={loading}
                          disabled={
                            !firstName.trim() ||
                            !lastName.trim() ||
                            selectedRoles.length === 0 ||
                            !turnstileToken
                          }
                          onClick={handleSubmit}
                        >
                          Sign Up
                        </Button>
                      </Group>
                    </div>
                  )}
                </>
              )}
            </Paper>
          </div>
        </Container>
      </div>
    </CircleBackground>
  );
}
