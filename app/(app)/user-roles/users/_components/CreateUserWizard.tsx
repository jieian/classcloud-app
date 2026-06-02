"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Container, Text } from "@mantine/core";
import WizardNavigationButtons from "@/components/WizardNavigationButtons";
import VerticalWizardLayout, { type VerticalWizardStep } from "@/components/VerticalWizardLayout";
import { useMediaQuery } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notify } from "@/components/notificationIcon/notificationIcon";
import StepUserInfo from "./StepUserInfo";
import StepAssignRole from "./StepAssignRole";
import StepReview from "./StepReview";
import { validateCreateUserForm } from "../_lib/validation";
import {
  createUser,
  checkEmailStatus,
  fetchAllRoles,
  checkPrincipalExists,
} from "../_lib";
import type { EmailStatus } from "../_lib/userRolesService";
import { toTitleCase, generateSecurePassword } from "../_lib/utils";
import type { CreateUserForm } from "../_lib/types";
import type { Role } from "../_lib/userRolesService";

const PRINCIPAL_ROLE_NAME = "Principal";
const ALLOWED_DOMAINS = ["baliuagu.edu.ph", "gmail.com", "deped.gov.ph"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CreateUserWizard() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [principalWarning, setPrincipalWarning] = useState(false);

  const form = useForm<CreateUserForm>({
    validateInputOnChange: true,
    initialValues: {
      first_name: "",
      middle_name: "",
      last_name: "",
      email: "",
      passwordType: "manual",
      password: "",
      generatedPassword: undefined,
      role_ids: [],
      activeStep: 0,
    },
    validate: validateCreateUserForm,
  });

  // Load roles once for both StepAssignRole and StepReview
  useEffect(() => {
    loadRoles();
  }, []);

  async function loadRoles() {
    try {
      setLoadingRoles(true);
      const roles = await fetchAllRoles();
      setAvailableRoles(roles);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to load roles. Please try again.";
      notify({
        type: "error",
        title: "Error Loading Roles",
        message: errorMessage,
        autoClose: 10000,
      });
    } finally {
      setLoadingRoles(false);
    }
  }

  // Warn user before leaving with unsaved changes (browser refresh/close)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (form.isDirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  // Handler reads form.isDirty() fresh at event time — no need to re-register on dirty change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDirty = form.isDirty();

  // Intercept client-side navigation (NavBar Link clicks) when form is dirty
  useEffect(() => {
    if (!isDirty) return;

    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;

      const href = anchor.getAttribute("href")!;
      // Only intercept internal navigation; ignore external, hash, mailto, etc.
      if (/^(https?:|#|mailto:|tel:)/.test(href)) return;

      e.preventDefault();
      e.stopPropagation();

      modals.openConfirmModal({
        title: "Discard changes?",
        children: (
          <Text size="sm">
            You have unsaved changes. Are you sure you want to leave?
          </Text>
        ),
        labels: { confirm: "Discard", cancel: "Stay" },
        confirmProps: { color: "red" },
        onConfirm: () => {
          form.reset();
          router.push(href);
        },
        ...confirmModalProps,
      });
    };

    // Capture phase so we intercept before Next.js processes the click
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  // form, router, confirmModalProps are stable or defined after this hook
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  const [checkingEmail, setCheckingEmail] = useState(false);
  const [stepHasError, setStepHasError] = useState(false);
  const [maxStep, setMaxStep] = useState(0);
  const busyRef = useRef(false);
  const verifiedEmailRef = useRef<string | null>(null);

  const validateCurrentStep = async (): Promise<boolean> => {
    if (busyRef.current) return false;

    if (form.values.activeStep === 0) {
      const validation = form.validate();

      const missingFields: string[] = [];
      if (!form.values.first_name.trim()) missingFields.push("First Name");
      if (!form.values.last_name.trim()) missingFields.push("Last Name");
      if (!form.values.email.trim()) missingFields.push("Email");
      if (form.values.passwordType === "manual" && !form.values.password)
        missingFields.push("Password");

      if (missingFields.length > 0) {
        notify({
          type: "error",
          title: "Missing Required Fields",
          message: `${missingFields.join(", ")} ${missingFields.length === 1 ? "is" : "are"} missing.`,
        });
        setStepHasError(true);
        return false;
      }

      const step1HasErrors =
        validation.errors.first_name ||
        validation.errors.last_name ||
        validation.errors.email ||
        validation.errors.middle_name ||
        (form.values.passwordType === "manual" && validation.errors.password);

      if (step1HasErrors) {
        notify({
          type: "error",
          title: "Validation Error",
          message: "Please correct the highlighted errors before proceeding.",
        });
        setStepHasError(true);
        return false;
      }

      // Check email status — skip if same email was already verified
      const trimmedEmail = form.values.email.trim();
      if (verifiedEmailRef.current !== trimmedEmail) {
        busyRef.current = true;
        setCheckingEmail(true);
        try {
          const emailStatus: EmailStatus = await checkEmailStatus(trimmedEmail);

          if (emailStatus.status === "active") {
            form.setFieldError("email", "This email is already in use");
            notify({
              type: "error",
              title: "Email Already In Use",
              message: "This email is already registered. Please use a different email.",
            });
            setStepHasError(true);
            return false;
          }

          if (emailStatus.status === "pending_invite") {
            form.setFieldError("email", "This email already has a pending invitation");
            notify({
              type: "warning",
              title: "Pending Invitation",
              message: "This email already has a pending invitation. Check the Pending section.",
              color: "orange",
            });
            setStepHasError(true);
            return false;
          }

          verifiedEmailRef.current = trimmedEmail;
        } catch {
          notify({ type: "error", title: "Error", message: "Failed to verify email. Please try again." });
          setStepHasError(true);
          return false;
        } finally {
          busyRef.current = false;
          setCheckingEmail(false);
        }
      }

      // Generate password if autogenerated
      if (form.values.passwordType === "autogenerated") {
        const generated = generateSecurePassword();
        form.setFieldValue("generatedPassword", generated);
      }
    } else if (form.values.activeStep === 1) {
      const validation = form.validate();
      if (validation.errors.role_ids) {
        notify({ type: "error", title: "No Role Selected", message: "Select at least one role before proceeding." });
        setStepHasError(true);
        return false;
      }

      // Principal check — soft warning only, does not block
      const selectedRoleNames = form.values.role_ids
        .map((id) => availableRoles.find((r) => r.role_id.toString() === id)?.name)
        .filter(Boolean);

      if (selectedRoleNames.includes(PRINCIPAL_ROLE_NAME)) {
        try {
          const principalExists = await checkPrincipalExists();
          setPrincipalWarning(principalExists);
        } catch {
          setPrincipalWarning(false);
        }
      } else {
        setPrincipalWarning(false);
      }
    }

    return true;
  };

  const nextStep = async () => {
    const valid = await validateCurrentStep();
    if (!valid) return;
    setStepHasError(false);
    const next = form.values.activeStep + 1;
    setMaxStep((prev) => Math.max(prev, next));
    form.setFieldValue("activeStep", next);
  };

  const prevStep = () => {
    setStepHasError(false);
    form.setFieldValue("activeStep", form.values.activeStep - 1);
    // Clear cached email verification so the check runs again if the user edits it
    verifiedEmailRef.current = null;
  };

  // Live email check on blur — mirrors the SignUp page behaviour.
  // Only fires when the domain is valid; skips if already verified.
  const handleEmailBlur = async () => {
    const trimmedEmail = form.values.email.trim();
    if (!trimmedEmail) return;

    const domainValid = ALLOWED_DOMAINS.some((d) =>
      trimmedEmail.toLowerCase().endsWith(`@${d}`),
    );
    if (!domainValid) return;
    if (!EMAIL_REGEX.test(trimmedEmail)) return;
    if (verifiedEmailRef.current === trimmedEmail) return;
    if (busyRef.current) return;

    busyRef.current = true;
    setCheckingEmail(true);
    try {
      const emailStatus: EmailStatus = await checkEmailStatus(trimmedEmail);

      if (emailStatus.status === "active") {
        form.setFieldError("email", "This email is already in use");
        return;
      }
      if (emailStatus.status === "pending_invite") {
        form.setFieldError(
          "email",
          "This email already has a pending invitation",
        );
        return;
      }

      // Available — cache so Next skips the redundant call
      verifiedEmailRef.current = trimmedEmail;
      form.clearFieldError("email");
    } catch {
      // Non-fatal — Next will retry if needed
    } finally {
      busyRef.current = false;
      setCheckingEmail(false);
    }
  };

  const handleCancel = () => {
    if (form.isDirty()) {
      modals.openConfirmModal({
        title: "Discard changes?",
        children: (
          <Text size="sm">
            You have unsaved changes. Are you sure you want to leave?
          </Text>
        ),
        labels: { confirm: "Discard", cancel: "Stay" },
        confirmProps: { color: "red" },
        onConfirm: () => {
          form.reset();
          router.replace("/user-roles/users");
          router.refresh();
        },
        ...confirmModalProps,
      });
    } else {
      router.replace("/user-roles/users");
      router.refresh();
    }
  };

  const handleCreateUser = () => {
    modals.openConfirmModal({
      title: "Send Invitation?",
      children: (
        <Text size="sm">
          This will create an account for{" "}
          <strong>
            {form.values.first_name} {form.values.last_name}
          </strong>{" "}
          with {form.values.role_ids.length} role(s) and send them an invitation
          email to activate their account.
        </Text>
      ),
      labels: { confirm: "Send Invitation", cancel: "Cancel" },
      confirmProps: { style: { backgroundColor: "#4EAE4A" } },
      onConfirm: async () => {
        await submitForm();
      },
      ...confirmModalProps,
    });
  };

  const submitForm = async () => {
    try {
      setLoading(true);

      const trimmedEmail = form.values.email.trim();

      // Determine password to use
      const passwordToUse =
        form.values.passwordType === "autogenerated"
          ? form.values.generatedPassword!
          : form.values.password;

      const userData = {
        first_name: toTitleCase(form.values.first_name.trim()),
        middle_name: form.values.middle_name.trim()
          ? toTitleCase(form.values.middle_name.trim())
          : null,
        last_name: toTitleCase(form.values.last_name.trim()),
        email: trimmedEmail,
        password: passwordToUse,
        role_ids: form.values.role_ids.map((id) => parseInt(id)),
      };

      await createUser(userData);

      notify({
        type: "success",
        title: "Invitation Sent",
        message: `An invitation email has been sent to ${trimmedEmail}.`,
      });

      form.reset();
      router.replace("/user-roles/users");
      router.refresh();
    } catch (error) {
      console.error("User invitation error:", error);
      const isEmailFailure = (error as { code?: string }).code === "EMAIL_DELIVERY_FAILED";
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create user. Please try again.";
      notify({
        type: isEmailFailure ? "warning" : "error",
        title: isEmailFailure ? "Email Could Not Be Delivered" : "Error",
        message,
        autoClose: isEmailFailure ? false : 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  const isMobile = useMediaQuery("(max-width: 768px)");
  const confirmModalProps = isMobile
    ? {
        styles: {
          inner: { alignItems: "flex-end", paddingBottom: "20px" },
          content: { width: "100%", maxWidth: "100%", borderRadius: "12px 12px 0 0" },
        },
      }
    : {};

  const wizardSteps: VerticalWizardStep[] = [
    { label: "Step 1", description: "User Information", hasError: form.values.activeStep === 0 && stepHasError },
    { label: "Step 2", description: "Roles Assignment", hasError: form.values.activeStep === 1 && stepHasError },
    { label: "Step 3", description: "Review and Create" },
  ];

  return (
    <Container fluid py="xl" h="100%">
      <VerticalWizardLayout
        active={form.values.activeStep}
        steps={wizardSteps}
        maxStep={maxStep}
        onStepClick={async (idx) => {
          if (idx > form.values.activeStep) {
            const valid = await validateCurrentStep();
            if (!valid) return;
          }
          setStepHasError(false);
          form.setFieldValue("activeStep", idx);
        }}
      >
        <>
          {form.values.activeStep === 0 && (
            <StepUserInfo form={form} checkingEmail={checkingEmail} onEmailBlur={handleEmailBlur} />
          )}
          {form.values.activeStep === 1 && (
            <StepAssignRole form={form} availableRoles={availableRoles} loadingRoles={loadingRoles} />
          )}
          {form.values.activeStep === 2 && (
            <StepReview form={form} availableRoles={availableRoles} principalWarning={principalWarning} />
          )}
          <WizardNavigationButtons
            onCancel={handleCancel}
            showPrevious={form.values.activeStep > 0}
            onPrevious={prevStep}
            onPrimary={form.values.activeStep < 2 ? nextStep : handleCreateUser}
            primaryLabel={form.values.activeStep < 2 ? "Next" : "Send Invitation"}
            primaryLoading={form.values.activeStep < 2 ? checkingEmail : loading}
            stickyMobile
          />
        </>
      </VerticalWizardLayout>
    </Container>
  );
}
