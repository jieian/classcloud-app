"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Container, Group, rem, Stepper, Text } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { getSupabase } from "@/lib/supabase/client";
import StepCurriculumNameDesc from "./StepCurriculumNameDesc";
import StepCurriculumSubjects from "./StepCurriculumSubjects";
import StepCurriculumSubjectGroups from "./StepCurriculumSubjectGroups";
import StepCurriculumReview from "./StepCurriculumReview";
import type { CreateCurriculumForm, GradeLevel } from "../_lib/types";

// ── Name validation ────────────────────────────────────────────────────────────
function validateName(v: string): string | null {
  if (!v.trim()) return "Curriculum name is required.";
  if (v.trim().length < 3) return "Must be at least 3 characters.";
  if (v.trim().length > 50) return "Must be 50 characters or less.";
  if (/^\d+$/.test(v.trim())) return "Name can't be only numbers.";
  if (/^\.+$/.test(v.trim())) return "Name can't be only dots.";
  if (!/^[A-Za-z0-9\s\-'()]+$/.test(v.trim()))
    return "Only letters, numbers, spaces, hyphens, apostrophes, and parentheses are allowed.";
  return null;
}

function validateDescription(v: string): string | null {
  if (!v.trim()) return "Description is required.";
  if (v.trim().length < 10) return "Must be at least 10 characters.";
  if (v.trim().length > 500) return "Must be 500 characters or less.";
  if (/^\d+$/.test(v.trim())) return "Description can't be only numbers.";
  if (/^\.+$/.test(v.trim())) return "Description can't be only dots.";
  return null;
}

export default function CreateCurriculumWizard() {
  const router = useRouter();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [loading, setLoading] = useState(false);
  const [checkingName, setCheckingName] = useState(false);
  const busyRef = useRef(false);
  const verifiedNameRef = useRef<string | null>(null);

  // Grade levels loaded once; array preserves level_number order; map for quick name lookup
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [loadingGradeLevels, setLoadingGradeLevels] = useState(true);
  const gradeLevelNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const gl of gradeLevels) map.set(gl.grade_level_id, gl.display_name);
    return map;
  }, [gradeLevels]);
  useEffect(() => {
    getSupabase()
      .from("grade_levels")
      .select("grade_level_id, level_number, display_name")
      .order("level_number")
      .then(({ data }: { data: GradeLevel[] | null }) => {
        setGradeLevels(data ?? []);
        setLoadingGradeLevels(false);
      });
  }, []);

  const form = useForm<CreateCurriculumForm>({
    validateInputOnChange: true,
    initialValues: {
      name: "",
      description: "",
      subjects: [],
      subject_groups: [],
      activeStep: 0,
    },
    validate: {
      name: validateName,
      description: validateDescription,
    },
  });

  // Warn before browser close/refresh when dirty
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (form.isDirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [form.isDirty()]);

  // Intercept NavBar link clicks when dirty
  useEffect(() => {
    if (!form.isDirty()) return;
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href")!;
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
      });
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [form.isDirty()]);

  const nextStep = async () => {
    if (busyRef.current) return;

    if (form.values.activeStep === 0) {
      // Validate Step 1 fields
      const result = form.validate();
      if (result.errors.name || result.errors.description) {
        notifications.show({
          title: "Validation Error",
          message: "Please fix all errors before proceeding.",
          color: "red",
        });
        return;
      }
      // Async name uniqueness check
      const trimmed = form.values.name.trim();
      if (verifiedNameRef.current !== trimmed) {
        busyRef.current = true;
        setCheckingName(true);
        try {
          const res = await fetch("/api/curriculum/check-name", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: trimmed }),
          });
          const data = await res.json();
          if (!data.available) {
            form.setFieldError(
              "name",
              "A curriculum with this name already exists.",
            );
            notifications.show({
              title: "Name Taken",
              message: "Please choose a different curriculum name.",
              color: "red",
            });
            return;
          }
          verifiedNameRef.current = trimmed;
        } catch {
          notifications.show({
            title: "Error",
            message: "Failed to verify curriculum name. Please try again.",
            color: "red",
          });
          return;
        } finally {
          busyRef.current = false;
          setCheckingName(false);
        }
      }
    }

    if (form.values.activeStep === 1) {
      // Every grade level must have at least one subject
      const coveredGlIds = new Set(
        form.values.subjects.map((s) => s.grade_level_id),
      );
      const allGlIds = Array.from(gradeLevelNames.keys());
      const missing = allGlIds.filter((id) => !coveredGlIds.has(id));
      if (form.values.subjects.length === 0) {
        notifications.show({
          title: "No Subjects",
          message: "Add at least one subject before proceeding.",
          color: "red",
        });
        return;
      }
      if (missing.length > 0) {
        const names = missing
          .map((id) => gradeLevelNames.get(id) ?? `Grade ${id}`)
          .join(", ");
        notifications.show({
          title: "Missing Subjects",
          message: `Every grade level needs at least one subject. Missing: ${names}`,
          color: "red",
          autoClose: 7000,
        });
        return;
      }
    }

    if (form.values.activeStep === 2) {
      if (form.values.subject_groups.length === 0) {
        notifications.show({
          title: "No Subject Groups",
          message: "Create at least one subject group before proceeding.",
          color: "red",
        });
        return;
      }
      const occupiedTempIds = new Set(
        form.values.subject_groups.flatMap((g) => g.memberTempIds),
      );
      const unassigned = form.values.subjects.filter(
        (s) => !occupiedTempIds.has(s.tempId),
      );
      if (unassigned.length > 0) {
        notifications.show({
          title: "Unassigned Subjects",
          message: `All subjects must be in a group. ${unassigned.length} subject(s) still unassigned.`,
          color: "red",
          autoClose: 6000,
        });
        return;
      }
    }

    form.setFieldValue("activeStep", form.values.activeStep + 1);
  };

  const prevStep = () => {
    form.setFieldValue("activeStep", form.values.activeStep - 1);
    verifiedNameRef.current = null;
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
          router.replace("/school/curriculum");
          router.refresh();
        },
      });
    } else {
      router.replace("/school/curriculum");
      router.refresh();
    }
  };

  const handleCreate = () => {
    modals.openConfirmModal({
      title: "Create Curriculum?",
      children: (
        <Text size="sm">
          This will create <strong>{form.values.name.trim()}</strong> with{" "}
          {form.values.subjects.length} subject(s) and{" "}
          {form.values.subject_groups.length} group(s).
        </Text>
      ),
      labels: { confirm: "Create Curriculum", cancel: "Cancel" },
      confirmProps: { style: { backgroundColor: "#4EAE4A" } },
      onConfirm: submitForm,
    });
  };

  const submitForm = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/curriculum/create-full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.values.name.trim(),
          description: form.values.description.trim(),
          subjects: form.values.subjects,
          subject_groups: form.values.subject_groups,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notifications.show({
          title: "Error",
          message: data.error ?? "Failed to create curriculum.",
          color: "red",
          autoClose: false,
        });
        return;
      }
      notifications.show({
        title: "Success",
        message: `"${form.values.name.trim()}" has been created.`,
        color: "green",
      });
      form.reset();
      router.replace("/school/curriculum");
      router.refresh();
    } catch {
      notifications.show({
        title: "Error",
        message: "Network error. Please try again.",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  // Next button disabled logic
  const isNextDisabled = (() => {
    if (form.values.activeStep === 0) {
      return (
        !form.values.name.trim() ||
        !form.values.description.trim() ||
        !!form.errors.name ||
        !!form.errors.description
      );
    }
    if (form.values.activeStep === 1) {
      if (form.values.subjects.length === 0) return true;
      const coveredGlIds = new Set(
        form.values.subjects.map((s) => s.grade_level_id),
      );
      return Array.from(gradeLevelNames.keys()).some(
        (id) => !coveredGlIds.has(id),
      );
    }
    if (form.values.activeStep === 2)
      return form.values.subject_groups.length === 0;
    return false;
  })();

  const steps = [
    { label: "Step 1", description: "Curriculum Information" },
    { label: "Step 2", description: "Define Subjects" },
    { label: "Step 3", description: "Define Subject Groups" },
    { label: "Step 4", description: "Review & Create" },
  ];

  const stepContent = (
    <>
      {form.values.activeStep === 0 && <StepCurriculumNameDesc form={form} />}
      {form.values.activeStep === 1 && (
        <StepCurriculumSubjects
          form={form}
          gradeLevels={gradeLevels}
          loadingGradeLevels={loadingGradeLevels}
        />
      )}
      {form.values.activeStep === 2 && (
        <StepCurriculumSubjectGroups
          form={form}
          gradeLevelNames={gradeLevelNames}
        />
      )}
      {form.values.activeStep === 3 && (
        <StepCurriculumReview form={form} gradeLevels={gradeLevels} />
      )}
    </>
  );

  const navButtons = (
    <Group justify="flex-end" mt="xl">
      <Button variant="default" onClick={handleCancel}>
        Cancel
      </Button>
      {form.values.activeStep > 0 && (
        <Button variant="outline" onClick={prevStep}>
          Previous
        </Button>
      )}
      {form.values.activeStep < 3 ? (
        <Button
          onClick={nextStep}
          disabled={isNextDisabled}
          loading={checkingName}
          style={isNextDisabled ? undefined : { backgroundColor: "#4EAE4A" }}
        >
          Next
        </Button>
      ) : (
        <Button
          onClick={handleCreate}
          loading={loading}
          style={{ backgroundColor: "#4EAE4A" }}
        >
          Create Curriculum
        </Button>
      )}
    </Group>
  );

  return (
    <Container fluid py="xl" h="100%">
      {isMobile ? (
        <>
          <Stepper
            active={form.values.activeStep}
            color="#4EAE4A"
            orientation="vertical"
          >
            {steps.map((s, i) => (
              <Stepper.Step key={i} label={s.label} description={s.description}>
                {form.values.activeStep === i && stepContent}
              </Stepper.Step>
            ))}
          </Stepper>
          {navButtons}
        </>
      ) : (
        <div style={{ display: "flex", gap: rem(32), height: "100%" }}>
          {/* Left: Stepper */}
          <div style={{ flexShrink: 0, width: "20%" }}>
            <Stepper
              active={form.values.activeStep}
              color="#4EAE4A"
              orientation="vertical"
            >
              {steps.map((s, i) => (
                <Stepper.Step
                  key={i}
                  label={s.label}
                  description={s.description}
                />
              ))}
            </Stepper>
          </div>
          {/* Right: Content */}
          <div style={{ width: "70%" }}>
            {stepContent}
            {navButtons}
          </div>
        </div>
      )}
    </Container>
  );
}
