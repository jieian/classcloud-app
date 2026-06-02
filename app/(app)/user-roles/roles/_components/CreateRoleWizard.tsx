"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Container, Text } from "@mantine/core";
import WizardNavigationButtons from "@/components/WizardNavigationButtons";
import { useMediaQuery } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notify } from "@/components/notificationIcon/notificationIcon";
import VerticalWizardLayout, {
  type VerticalWizardStep,
} from "@/components/VerticalWizardLayout";
import StepRoleInfo from "./StepRoleInfo";
import StepAssignPerms from "./StepAssignPerms";
import StepReview from "./StepReview";
import { validateCreateRoleForm } from "../../users/_lib/validation";
import {
  fetchAllPermissions,
  checkRoleNameExists,
  createRole,
} from "../../users/_lib";
import { CreateRoleForm } from "../../users/_lib/types";
import { Permission } from "../../users/_lib/userRolesService";

export default function CreateRoleWizard() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [availablePermissions, setAvailablePermissions] = useState<
    Permission[]
  >([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);

  const form = useForm<CreateRoleForm>({
    validateInputOnChange: true,
    initialValues: {
      name: "",
      is_faculty: false,
      is_self_registerable: false,
      permission_ids: [],
      activeStep: 0,
    },
    validate: validateCreateRoleForm,
  });

  useEffect(() => {
    loadPermissions();
  }, []);

  async function loadPermissions() {
    try {
      setLoadingPermissions(true);
      const permissions = await fetchAllPermissions();
      setAvailablePermissions(permissions);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to load permissions. Please try again.";
      notify({
        type: "error",
        title: "Error Loading Permissions",
        message: errorMessage,
        autoClose: 10000,
      });
    } finally {
      setLoadingPermissions(false);
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
  // form/router are stable refs; confirmModalProps is defined after this hook and can't be listed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  const [checkingName, setCheckingName] = useState(false);
  const [stepHasError, setStepHasError] = useState(false);
  const [maxStep, setMaxStep] = useState(0);
  const busyRef = useRef(false);
  const verifiedNameRef = useRef<string | null>(null);

  const validateCurrentStep = async (): Promise<boolean> => {
    if (busyRef.current) return false;

    if (form.values.activeStep === 0) {
      const validation = form.validate();
      const nameError = validation.errors.name;

      if (nameError) {
        const isEmpty = !form.values.name.trim();
        notify({
          type: "error",
          title: isEmpty ? "Missing Role Name" : "Invalid Role Name",
          message: isEmpty
            ? "Enter a role name to continue."
            : "Fix the role name error before proceeding.",
        });
        setStepHasError(true);
        return false;
      }

      const trimmedName = form.values.name.trim();
      if (verifiedNameRef.current !== trimmedName) {
        busyRef.current = true;
        setCheckingName(true);
        try {
          const nameTaken = await checkRoleNameExists(trimmedName);
          if (nameTaken) {
            form.setFieldError("name", "Role name already exists");
            notify({
              type: "error",
              title: "Role Name Taken",
              message: "Role name already exists. Please use a different role name.",
            });
            setStepHasError(true);
            return false;
          }
          verifiedNameRef.current = trimmedName;
        } catch {
          notify({
            type: "error",
            title: "Error",
            message: "Failed to verify role name. Please try again.",
          });
          setStepHasError(true);
          return false;
        } finally {
          busyRef.current = false;
          setCheckingName(false);
        }
      }
    } else if (form.values.activeStep === 1) {
      const validation = form.validate();
      if (validation.errors.permission_ids) {
        notify({
          type: "error",
          title: "No Permissions Selected",
          message: "Select at least one permission to continue.",
        });
        setStepHasError(true);
        return false;
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
          router.replace("/user-roles/roles");
          router.refresh();
        },
        ...confirmModalProps,
      });
    } else {
      router.replace("/user-roles/roles");
      router.refresh();
    }
  };

  const handleCreateRole = () => {
    modals.openConfirmModal({
      title: "Create New Role?",
      children: (
        <Text size="sm">
          This will create a role named {""}
          <strong>{form.values.name}</strong> with{" "}
          {form.values.permission_ids.length} permission(s).
        </Text>
      ),
      labels: { confirm: "Create Role", cancel: "Cancel" },
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

      await createRole(
        form.values.name.trim(),
        form.values.is_faculty,
        form.values.is_self_registerable,
        form.values.permission_ids,
      );

      notify({
        type: "success",
        title: "Success",
        message: `Role "${form.values.name.trim()}" created successfully.`,
      });

      form.reset();
      router.replace("/user-roles/roles");
      router.refresh();
    } catch (error) {
      console.error("Role creation error:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create role. Please try again.";
      notify({
        type: "error",
        title: "Error",
        message,
        autoClose: false,
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
          content: {
            width: "100%",
            maxWidth: "100%",
            borderRadius: "12px 12px 0 0",
          },
        },
      }
    : {};

  const wizardSteps: VerticalWizardStep[] = [
    { label: "Step 1", description: "Role Information and Configuration", hasError: form.values.activeStep === 0 && stepHasError },
    { label: "Step 2", description: "Permissions Assignment", hasError: form.values.activeStep === 1 && stepHasError },
    { label: "Step 3", description: "Review and Create" },
  ];

  const activeContent = (() => {
    if (form.values.activeStep === 0) return <StepRoleInfo form={form} />;
    if (form.values.activeStep === 1) {
      return (
        <StepAssignPerms
          form={form}
          availablePermissions={availablePermissions}
          loadingPermissions={loadingPermissions}
        />
      );
    }
    return (
      <StepReview form={form} availablePermissions={availablePermissions} />
    );
  })();

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
          form.setFieldValue('activeStep', idx);
        }}
      >
        {activeContent}
      </VerticalWizardLayout>

      <WizardNavigationButtons
        onCancel={handleCancel}
        showPrevious={form.values.activeStep > 0}
        onPrevious={prevStep}
        onPrimary={form.values.activeStep < 2 ? nextStep : handleCreateRole}
        primaryLabel={form.values.activeStep < 2 ? "Next" : "Create Role"}
        primaryLoading={form.values.activeStep < 2 ? checkingName : loading}
        stickyMobile
      />
    </Container>
  );
}
