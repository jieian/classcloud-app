"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Container, Text } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notify } from "@/components/notificationIcon/notificationIcon";
import { getSupabase } from "@/lib/supabase/client";
import WizardNavigationButtons from "@/components/WizardNavigationButtons";
import VerticalWizardLayout, { type VerticalWizardStep } from "@/components/VerticalWizardLayout";
import StepCurriculumNameDesc from "./StepCurriculumNameDesc";
import StepCurriculumSubjects from "./StepCurriculumSubjects";
import StepCurriculumSubjectGroups from "./StepCurriculumSubjectGroups";
import StepCurriculumReview from "./StepCurriculumReview";
import type { CreateCurriculumForm, GradeLevel } from "../_lib/types";

function EnterToConfirm({ onEnter }: { onEnter: () => void }) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Enter") onEnter();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// ── Notification title helpers ─────────────────────────────────────────────────
function nameErrorTitle(err: string): string {
  if (err.includes("required")) return "Name Required";
  if (err.includes("at least")) return "Name Too Short";
  if (err.includes("or less")) return "Name Too Long";
  if (err.includes("only numbers") || err.includes("only dots")) return "Invalid Name Format";
  if (err.includes("Only letters")) return "Invalid Characters in Name";
  if (err.includes("already exists")) return "Name Already Taken";
  return "Invalid Name";
}

function descErrorTitle(err: string): string {
  if (err.includes("required")) return "Description Required";
  if (err.includes("at least")) return "Description Too Short";
  if (err.includes("or less")) return "Description Too Long";
  if (err.includes("only numbers") || err.includes("only dots")) return "Invalid Description Format";
  return "Invalid Description";
}

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
  const confirmModalProps = isMobile
    ? {
        styles: {
          inner: { alignItems: "flex-end", paddingBottom: "20px" },
          content: { width: "100%", maxWidth: "100%", borderRadius: "12px 12px 0 0" },
        },
      }
    : {};
  const [loading, setLoading] = useState(false);
  const [checkingName, setCheckingName] = useState(false);
  const [stepHasError, setStepHasError] = useState(false);
  const [maxStep, setMaxStep] = useState(0);
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
  // Handler reads form.isDirty() fresh at event time — no need to re-register on dirty change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDirty = form.isDirty();

  // Intercept NavBar link clicks when dirty
  useEffect(() => {
    if (!isDirty) return;
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href")!;
      if (/^(https?:|#|mailto:|tel:)/.test(href)) return;
      e.preventDefault();
      e.stopPropagation();
      const navModalId = modals.openConfirmModal({
        title: "Discard changes?",
        children: (
          <>
            <EnterToConfirm onEnter={() => { form.reset(); router.push(href); modals.close(navModalId); }} />
            <Text size="sm">You have unsaved changes. Are you sure you want to leave?</Text>
          </>
        ),
        labels: { confirm: "Discard", cancel: "Stay" },
        confirmProps: { color: "red" },
        onConfirm: () => { form.reset(); router.push(href); },
        ...confirmModalProps,
      });
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  // form, router, confirmModalProps are stable or defined after this hook
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  const validateCurrentStep = async (): Promise<boolean> => {
    if (busyRef.current) return false;

    if (form.values.activeStep === 0) {
      const result = form.validate();
      if (result.errors.name || result.errors.description) {
        const nameErr = result.errors.name as string | undefined;
        const descErr = result.errors.description as string | undefined;
        if (nameErr) {
          notify({ type: "error", title: nameErrorTitle(nameErr), message: nameErr });
        } else {
          notify({ type: "error", title: descErrorTitle(descErr!), message: descErr! });
        }
        setStepHasError(true);
        return false;
      }
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
            const takenMsg = "A curriculum with this name already exists.";
            form.setFieldError("name", takenMsg);
            notify({ type: "error", title: "Name Already Taken", message: takenMsg });
            setStepHasError(true);
            return false;
          }
          verifiedNameRef.current = trimmed;
        } catch {
          notify({
            type: "error",
            title: "Name Check Failed",
            message: "Failed to verify curriculum name. Please try again.",
          });
          setStepHasError(true);
          return false;
        } finally {
          busyRef.current = false;
          setCheckingName(false);
        }
      }
    }

    if (form.values.activeStep === 1) {
      const coveredGlIds = new Set(form.values.subjects.map((s) => s.grade_level_id));
      const allGlIds = Array.from(gradeLevelNames.keys());
      const missing = allGlIds.filter((id) => !coveredGlIds.has(id));
      if (form.values.subjects.length === 0) {
        notify({ type: "error", title: "No Subjects", message: "Add at least one subject before proceeding." });
        setStepHasError(true);
        return false;
      }
      if (missing.length > 0) {
        const names = missing.map((id) => gradeLevelNames.get(id) ?? `Grade ${id}`).join(", ");
        notify({ type: "error", title: "Missing Subjects", message: `Every grade level needs at least one subject. Missing: ${names}`, autoClose: 7000 });
        setStepHasError(true);
        return false;
      }
    }

    if (form.values.activeStep === 2) {
      if (form.values.subject_groups.length === 0) {
        notify({ type: "error", title: "No Subject Groups", message: "Create at least one subject group before proceeding." });
        setStepHasError(true);
        return false;
      }
      const occupiedTempIds = new Set(form.values.subject_groups.flatMap((g) => g.memberTempIds));
      const unassigned = form.values.subjects.filter((s) => !occupiedTempIds.has(s.tempId));
      if (unassigned.length > 0) {
        notify({ type: "error", title: "Unassigned Subjects", message: `All subjects must be in a group. ${unassigned.length} subject(s) still unassigned.`, autoClose: 6000 });
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
    verifiedNameRef.current = null;
  };

  const handleCancel = () => {
    if (form.isDirty()) {
      const cancelModalId = modals.openConfirmModal({
      title: "Discard changes?",
      children: (
        <>
          <EnterToConfirm onEnter={() => { form.reset(); router.replace("/school/curriculum"); router.refresh(); modals.close(cancelModalId); }} />
          <Text size="sm">You have unsaved changes. Are you sure you want to leave?</Text>
        </>
      ),
      labels: { confirm: "Discard", cancel: "Stay" },
      confirmProps: { color: "red" },
      onConfirm: () => { form.reset(); router.replace("/school/curriculum"); router.refresh(); },
      ...confirmModalProps,
    });
    } else {
      router.replace("/school/curriculum");
      router.refresh();
    }
  };

  const handleCreate = () => {
    const createModalId = modals.openConfirmModal({
      title: "Create Curriculum?",
      children: (
        <>
          <EnterToConfirm onEnter={() => { submitForm(); modals.close(createModalId); }} />
          <Text size="sm">
            This will create <strong>{form.values.name.trim()}</strong> with{" "}
            {form.values.subjects.length} subject(s) and{" "}
            {form.values.subject_groups.length} group(s).
          </Text>
        </>
      ),
      labels: { confirm: "Create Curriculum", cancel: "Cancel" },
      confirmProps: { style: { backgroundColor: "#4EAE4A" } },
      onConfirm: submitForm,
      ...confirmModalProps,
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
        notify({
          type: "error",
          title: "Error",
          message: data.error ?? "Failed to create curriculum.",
          autoClose: false,
        });
        return;
      }
      notify({
        type: "success",
        title: "Success",
        message: `"${form.values.name.trim()}" has been created.`,
      });
      // Notify any open School Year wizard tab that a new curriculum is ready
      try {
        const bc = new BroadcastChannel("curriculum_created");
        bc.postMessage({
          type: "CURRICULUM_CREATED",
          curriculum_id: data.curriculum_id,
          name: form.values.name.trim(),
        });
        bc.close();
      } catch { /* BroadcastChannel unavailable — ignore */ }
      form.reset();
      router.replace("/school/curriculum");
      router.refresh();
    } catch {
      notify({
        type: "error",
        title: "Error",
        message: "Network error. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const wizardSteps: VerticalWizardStep[] = [
    { label: "Step 1", description: "Curriculum Information", hasError: form.values.activeStep === 0 && stepHasError },
    { label: "Step 2", description: "Define Subjects", hasError: form.values.activeStep === 1 && stepHasError },
    { label: "Step 3", description: "Define Subject Groups", hasError: form.values.activeStep === 2 && stepHasError },
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

  const isFinalStep = form.values.activeStep === 3;
  const navButtons = (
    <WizardNavigationButtons
      onCancel={handleCancel}
      showPrevious={form.values.activeStep > 0}
      onPrevious={prevStep}
      onPrimary={isFinalStep ? handleCreate : nextStep}
      primaryLabel={isFinalStep ? "Create Curriculum" : "Next"}
      primaryDisabled={false}
      primaryLoading={isFinalStep ? loading : checkingName}
      stickyMobile
    />
  );

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
        {stepContent}
        {navButtons}
      </VerticalWizardLayout>
    </Container>
  );
}
