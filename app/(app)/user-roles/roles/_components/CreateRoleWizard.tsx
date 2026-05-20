"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Container, Text } from "@mantine/core";
import WizardNavigationButtons from "@/components/WizardNavigationButtons";
import { useMediaQuery } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notify } from "@/components/notificationIcon/notificationIcon";
import VerticalWizardLayout, { type VerticalWizardStep } from "@/components/VerticalWizardLayout";
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
  }, [form.isDirty()]);

  // Intercept client-side navigation (NavBar Link clicks) when form is dirty
  useEffect(() => {
    if (!form.isDirty()) return;

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
  }, [form.isDirty()]);

  const [checkingName, setCheckingName] = useState(false);
  const busyRef = useRef(false);
  const verifiedNameRef = useRef<string | null>(null);

  const nextStep = async () => {
    // Guard against spam clicks — ref is synchronous, not batched like state
    if (busyRef.current) return;

    if (form.values.activeStep === 0) {
      const validation = form.validate();
      const step1HasErrors = validation.errors.name;

      if (step1HasErrors) {
        notify({
          type: "error",
          title: "Validation Error",
          message: "Please fix all errors before proceeding.",
        });
        return;
      }

      // Check name uniqueness — skip if same name was already verified
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
              message:
                "Role name already exists. Please use a different role name.",
            });
            return;
          }
          // Cache verified name so going back + forward skips the check
          verifiedNameRef.current = trimmedName;
        } catch (error) {
          notify({
            type: "error",
            title: "Error",
            message: "Failed to verify role name. Please try again.",
          });
          return;
        } finally {
          busyRef.current = false;
          setCheckingName(false);
        }
      }
    } else if (form.values.activeStep === 1) {
      // Validate Step 2 — at least one permission
      const validation = form.validate();
      if (validation.errors.permission_ids) {
        notify({
          type: "error",
          title: "Validation Error",
          message: "Please select at least one permission.",
        });
        return;
      }
    }

    form.setFieldValue("activeStep", form.values.activeStep + 1);
  };

  const prevStep = () => {
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

  const isNextDisabled = (() => {
    if (form.values.activeStep === 0) {
      const hasRequiredFields = form.values.name.trim() !== "";
      const hasErrors = !!form.errors.name;
      return !hasRequiredFields || hasErrors;
    }
    if (form.values.activeStep === 1) {
      return form.values.permission_ids.length === 0;
    }
    return false;
  })();

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
    {
      label: "Step 1",
      description: "Specify role information and configuration",
      content: <StepRoleInfo form={form} />,
    },
    {
      label: "Step 2",
      description: "Assign permissions",
      content: (
        <StepAssignPerms
          form={form}
          availablePermissions={availablePermissions}
          loadingPermissions={loadingPermissions}
        />
      ),
    },
    {
      label: "Step 3",
      description: "Review and Create Role",
      content: (
        <StepReview
          form={form}
          availablePermissions={availablePermissions}
        />
      ),
    },
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
      <StepReview
        form={form}
        availablePermissions={availablePermissions}
      />
    );
  })();

  return (
    <Container fluid py="xl" h="100%">
      <VerticalWizardLayout active={form.values.activeStep} steps={wizardSteps}>
        {activeContent}
      </VerticalWizardLayout>

      <WizardNavigationButtons
        onCancel={handleCancel}
        showPrevious={form.values.activeStep > 0}
        onPrevious={prevStep}
        onPrimary={form.values.activeStep < 2 ? nextStep : handleCreateRole}
        primaryLabel={form.values.activeStep < 2 ? "Next" : "Create Role"}
        primaryDisabled={form.values.activeStep < 2 ? isNextDisabled : false}
        primaryLoading={form.values.activeStep < 2 ? checkingName : loading}
      />
    </Container>
  );
}
