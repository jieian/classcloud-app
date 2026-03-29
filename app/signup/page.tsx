"use client";

import {
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
import { IconCheck, IconX } from "@tabler/icons-react";
import CircleBackground from "@/components/circleBackground/circleBackground";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import classes from "@/components/loginPage/LoginPage.module.css";

const ALLOWED_DOMAINS = ["baliuagu.edu.ph", "gmail.com"];
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
}

const ROLES_PER_PAGE = 3;

const PROTECTED_ROLE_NAMES = [
  "class adviser",
  "subject teacher",
  "grade level coordinator",
  "subject coordinator",
  "principal",
];

type EmailCheckStatus =
  | "idle"
  | "checking"
  | "available"
  | "active"
  | "deleted";

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
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [rolesError, setRolesError] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [rolePage, setRolePage] = useState(1);
  const sortedRoles = [
    ...roles.filter((r) =>
      PROTECTED_ROLE_NAMES.includes(r.name.trim().toLowerCase()),
    ),
    ...roles.filter(
      (r) => !PROTECTED_ROLE_NAMES.includes(r.name.trim().toLowerCase()),
    ),
  ];

  // ── Submit ──
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [shaking, setShaking] = useState(false);

  const triggerShake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
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
        setEmailCheckStatus("idle");
        return "idle";
      }
      const status = data.status as EmailCheckStatus;
      checkedEmailRef.current = emailToCheck.toLowerCase();
      setEmailCheckStatus(status);
      if (status === "active") {
        setEmailError("This email is already registered.");
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
      setEmailError(`Email must end with @${ALLOWED_DOMAINS.join(" or @")}.`);
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
      setEmailError(`Email must end with @${ALLOWED_DOMAINS.join(" or @")}.`);
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

    setStep(1);
  };

  // ── Submit: validates Step 2 and calls the API ──
  const handleSubmit = async () => {
    setRolesError("");

    if (!firstName.trim() || !lastName.trim()) {
      triggerShake();
      notifications.show({
        title: "Missing Fields",
        message: "First name and last name are required.",
        color: "red",
      });
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
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setEmailError("This email is already registered.");
          setStep(0);
          triggerShake();
          return;
        }
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

              <Text
                ta="center"
                fw={750}
                className={`${classes.greenColor} ${classes.welcomeText}`}
              >
                Create an Account
              </Text>

              {/* ── Success state ── */}
              {submitted ? (
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
                  <Text ta="center" fw={700} fz="lg" c="#45903B" mb="xs">
                    Check Your Inbox!
                  </Text>
                  <Text ta="center" size="sm" c="#555" mb="lg">
                    A verification link has been sent to{" "}
                    <strong>{submittedEmail}</strong>. Click the link in your
                    inbox to confirm your email — your account will then be
                    reviewed by an administrator.
                  </Text>
                  <Link href="/login" style={{ textDecoration: "none" }}>
                    <Text ta="center" size="sm" c="#808898">
                      ← Back to login page
                    </Text>
                  </Link>
                </>
              ) : (
                <>
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
                        placeholder={`you@${ALLOWED_DOMAINS[0]}`}
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
                            selectedRoles.length === 0
                          }
                          onClick={handleSubmit}
                        >
                          Create Account
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
