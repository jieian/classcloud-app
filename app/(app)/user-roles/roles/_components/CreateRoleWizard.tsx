"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Container, Stepper, Button, Group, Text, rem } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
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
      notifications.show({
        title: "Error Loading Permissions",
        message: errorMessage,
        color: "red",
        autoClose: 10000,
      });
    } finally {
      setLoadingPermissions(false);
    }
  }

  // Warn user before leaving with unsaved changes
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
        notifications.show({
          title: "Validation Error",
          message: "Please fix all errors before proceeding.",
          color: "red",
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
            notifications.show({
              title: "Role Name Taken",
              message:
                "Role name already exists. Please use a different role name.",
              color: "red",
            });
            return;
          }
          // Cache verified name so going back + forward skips the check
          verifiedNameRef.current = trimmedName;
        } catch (error) {
          notifications.show({
            title: "Error",
            message: "Failed to verify role name. Please try again.",
            color: "red",
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
        notifications.show({
          title: "Validation Error",
          message: "Please select at least one permission.",
          color: "red",
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
    });
  };

  const submitForm = async () => {
    try {
      setLoading(true);

      await createRole(form.values.name.trim(), form.values.permission_ids);

      notifications.show({
        title: "Success",
        message: `Role "${form.values.name.trim()}" created successfully.`,
        color: "green",
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
      notifications.show({
        title: "Error",
        message,
        color: "red",
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

  return (
    <Container fluid py="xl" h="100%">
      {isMobile ? (
        // Mobile: Stacked layout
        <>
          <Stepper
            active={form.values.activeStep}
            color="#4EAE4A"
            orientation="vertical"
          >
            <Stepper.Step label="Step 1" description="Specify role information">
              <StepRoleInfo form={form} />
            </Stepper.Step>

            <Stepper.Step label="Step 2" description="Assign permissions">
              <StepAssignPerms
                form={form}
                availablePermissions={availablePermissions}
                loadingPermissions={loadingPermissions}
              />
            </Stepper.Step>

            <Stepper.Step label="Step 3" description="Review and Create Role">
              <StepReview
                form={form}
                availablePermissions={availablePermissions}
              />
            </Stepper.Step>
          </Stepper>

          {/* Navigation Buttons */}
          <Group justify="flex-end" mt="xl">
            <Button variant="default" onClick={handleCancel}>
              Cancel
            </Button>

            {form.values.activeStep > 0 && (
              <Button variant="outline" onClick={prevStep}>
                Previous
              </Button>
            )}

            {form.values.activeStep < 2 ? (
              <Button
                onClick={nextStep}
                disabled={isNextDisabled}
                loading={checkingName}
                style={
                  isNextDisabled ? undefined : { backgroundColor: "#4EAE4A" }
                }
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={handleCreateRole}
                loading={loading}
                style={{ backgroundColor: "#4EAE4A" }}
              >
                Create Role
              </Button>
            )}
          </Group>
        </>
      ) : (
        // Desktop: Side-by-side layout
        <div style={{ display: "flex", gap: rem(32), height: "100%" }}>
          {/* Left side: Stepper (30%) */}
          <div style={{ flexShrink: 0, width: "20%" }}>
            <Stepper
              active={form.values.activeStep}
              color="#4EAE4A"
              orientation="vertical"
            >
              <Stepper.Step
                label="Step 1"
                description="Specify role information"
              />
              <Stepper.Step label="Step 2" description="Assign permissions" />
              <Stepper.Step
                label="Step 3"
                description="Review and Create Role"
              />
            </Stepper>
          </div>

          {/* Right side: Content (70%) */}
          <div style={{ width: "70%" }}>
            {form.values.activeStep === 0 && <StepRoleInfo form={form} />}
            {form.values.activeStep === 1 && (
              <StepAssignPerms
                form={form}
                availablePermissions={availablePermissions}
                loadingPermissions={loadingPermissions}
              />
            )}
            {form.values.activeStep === 2 && (
              <StepReview
                form={form}
                availablePermissions={availablePermissions}
              />
            )}

            {/* Navigation Buttons */}
            <Group justify="flex-end" mt="xl">
              <Button variant="default" onClick={handleCancel}>
                Cancel
              </Button>

              {form.values.activeStep > 0 && (
                <Button variant="outline" onClick={prevStep}>
                  Previous
                </Button>
              )}

              {form.values.activeStep < 2 ? (
                <Button
                  onClick={nextStep}
                  disabled={isNextDisabled}
                  style={
                    isNextDisabled ? undefined : { backgroundColor: "#4EAE4A" }
                  }
                >
                  Next
                </Button>
              ) : (
                <Button
                  onClick={handleCreateRole}
                  loading={loading}
                  style={{ backgroundColor: "#4EAE4A" }}
                >
                  Create Role
                </Button>
              )}
            </Group>
          </div>
        </div>
      )}
    </Container>
  );
}
