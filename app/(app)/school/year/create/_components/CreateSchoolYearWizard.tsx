"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Container, rem, Stepper, Text, Tooltip } from "@mantine/core";
import WizardNavigationButtons from "@/components/WizardNavigationButtons";
import { useForm } from "@mantine/form";
import { useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notify } from "@/components/notificationIcon/notificationIcon";
import StepAcademicPeriod from "./StepAcademicPeriod";
import StepSelectCurriculum from "./StepSelectCurriculum";
import StepDefineClasses from "./StepDefineClasses";
import StepFacultyAssignment from "./StepFacultyAssignment";
import StepGradeSubjectLeaders from "./StepGradeSubjectLeaders";
import StepSubjectCoordinators from "./StepSubjectCoordinators";
import StepReviewCreate from "./StepReviewCreate";
import MobileStepIndicator from "@/components/MobileStepIndicator";
import type {
  CoordinatorDraftMap,
  CreateSchoolYearForm,
  CreateSchoolYearFullPayload,
  FacultyCellKey,
  GslDraftMap,
  PreviousSySnapshot,
  QuarterCount,
  WizardCurriculumDetail,
  WizardFacultyOption,
  WizardInitialData,
} from "../_lib/types";
import { fetchPreviousSySnapshot, fetchWizardCurriculumDetail } from "../_lib/wizardService";
import { fetchActiveUsersWithRoles } from "@/app/(app)/user-roles/users/_lib";

interface CreateSchoolYearWizardProps {
  initialData: WizardInitialData;
}

export default function CreateSchoolYearWizard({ initialData }: CreateSchoolYearWizardProps) {
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
  const busyRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Curriculum detail (fetched on selection) ────────────────────────────────
  const [curriculumDetail, setCurriculumDetail] = useState<WizardCurriculumDetail | null>(null);
  const [loadingCurriculum, setLoadingCurriculum] = useState(false);

  // ── Previous SY snapshot (memoized in ref to avoid re-fetch) ───────────────
  const snapshotRef = useRef<PreviousSySnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  // ── Faculty list — fetched client-side on mount to bypass server cache ────────
  const [faculty, setFaculty] = useState<WizardFacultyOption[]>(initialData.faculty);
  useEffect(() => {
    fetchActiveUsersWithRoles().then((users) =>
      setFaculty(
        users
          .map((u) => ({ uid: u.uid, first_name: u.first_name, last_name: u.last_name }))
          .sort((a, b) => a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name))
      )
    ).catch(() => {/* keep faculty on error */});
  }, []);

  // ── Faculty draft (Step 4) — Map avoids O(n) re-renders per cell ───────────
  const [facultyDraft, setFacultyDraft] = useState<Map<FacultyCellKey, string | null>>(new Map());
  const [extraFacultyNames, setExtraFacultyNames] = useState<Map<string, string>>(new Map());

  // ── GSL draft (Step 5) ──────────────────────────────────────────────────────
  const [gslDraft, setGslDraft] = useState<GslDraftMap>(new Map());
  const [extraGslNames, setExtraGslNames] = useState<Map<string, string>>(new Map());

  // ── Coordinator draft (Step 6) ──────────────────────────────────────────────
  const [coordinatorDraft, setCoordinatorDraft] = useState<CoordinatorDraftMap>(new Map());
  const [extraCoordinatorNames, setExtraCoordinatorNames] = useState<Map<string, string>>(new Map());

  // ── Mantine form (Steps 1–3 + mode selections) ─────────────────────────────
  const form = useForm<CreateSchoolYearForm>({
    initialValues: {
      start_year: initialData.prevSy
        ? String(initialData.prevSy.start_year + 1)
        : "",
      num_quarters: 4 as QuarterCount,
      startYearLocked: initialData.prevSy !== null,
      curriculum_id: null,
      sections: [],
      step3Mode: initialData.prevSy ? null : "scratch",
      step4Mode: initialData.prevSy ? null : "scratch",
      step5Mode: initialData.prevSy ? null : "scratch",
      step6Mode: initialData.prevSy ? null : "scratch",
      activeStep: 0,
    },
  });

  const isDirty =
    form.isDirty() || facultyDraft.size > 0 || gslDraft.size > 0 || coordinatorDraft.size > 0;

  // ── Load curriculum detail when curriculum_id changes ──────────────────────
  const prevCurriculumIdRef = useRef<number | null>(null);

  useEffect(() => {
    const id = form.values.curriculum_id;

    // User changed an existing curriculum selection — reset all downstream state
    if (prevCurriculumIdRef.current !== null && prevCurriculumIdRef.current !== id) {
      form.setValues({
        sections: [],
        step3Mode: initialData.prevSy ? null : "scratch",
        step4Mode: initialData.prevSy ? null : "scratch",
        step5Mode: initialData.prevSy ? null : "scratch",
        step6Mode: initialData.prevSy ? null : "scratch",
      });
      setFacultyDraft(new Map());
      setExtraFacultyNames(new Map());
      setGslDraft(new Map());
      setExtraGslNames(new Map());
      setCoordinatorDraft(new Map());
      setExtraCoordinatorNames(new Map());
    }

    prevCurriculumIdRef.current = id;

    if (!id) {
      setCurriculumDetail(null);
      return;
    }
    setLoadingCurriculum(true);
    fetchWizardCurriculumDetail(id)
      .then(setCurriculumDetail)
      .catch(() =>
        notify({
          type: "error",
          title: "Error",
          message: "Failed to load curriculum details.",
        })
      )
      .finally(() => setLoadingCurriculum(false));
  }, [form.values.curriculum_id]);

  // ── Load prev SY snapshot (once, memoized) ─────────────────────────────────
  const loadSnapshot = useCallback(async () => {
    if (!initialData.prevSy || snapshotRef.current) return;
    setSnapshotLoading(true);
    try {
      snapshotRef.current = await fetchPreviousSySnapshot(initialData.prevSy.sy_id);
    } catch {
      notify({
        type: "error",
        title: "Error",
        message: "Failed to load previous school year data.",
      });
    } finally {
      setSnapshotLoading(false);
    }
  }, [initialData.prevSy]);

  // ── Reconcile facultyDraft when sections change ─────────────────────────────
  useEffect(() => {
    const activeTempIds = new Set(form.values.sections.map((s) => s.tempId));
    setFacultyDraft((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const key of next.keys()) {
        const tempId = key.startsWith("adviser:")
          ? key.slice("adviser:".length)
          : key.split(":")[1];
        if (!activeTempIds.has(tempId)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [form.values.sections]);

  // ── Dirty state guards ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href")!;
      if (/^(https?:|#|mailto:|tel:)/.test(href)) return;
      if (anchor.getAttribute("target") === "_blank") return;
      e.preventDefault();
      e.stopPropagation();
      modals.openConfirmModal({
        title: "Discard changes?",
        children: (
          <Text size="sm">
            You have unsaved changes. Leaving will discard all progress.
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
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isDirty]);

  // ── Validation logic per step ───────────────────────────────────────────────
  const [checkingYear, setCheckingYear] = useState(false);

  const validateStep = async (step: number): Promise<boolean> => {
    if (step === 0) {
      const sy = form.values.start_year.trim();
      if (!/^\d{4}$/.test(sy)) {
        notify({
          type: "error",
          title: "Validation Error",
          message: "Start year must be a 4-digit number.",
        });
        return false;
      }
      const yr = parseInt(sy, 10);
      if (yr <= 2025) {
        notify({
          type: "error",
          title: "Validation Error",
          message: "Start year must be 2026 or later.",
        });
        return false;
      }
      // Async duplicate check
      setCheckingYear(true);
      try {
        const res = await fetch(`/api/schoolYear/check-year?start_year=${yr}`);
        if (res.status === 409) {
          notify({
            type: "error",
            title: "Duplicate Year",
            message: `School year ${yr}–${yr + 1} already exists.`,
          });
          return false;
        }
      } catch {
        notify({
          type: "error",
          title: "Error",
          message: "Failed to verify school year. Please try again.",
        });
        return false;
      } finally {
        setCheckingYear(false);
      }
      return true;
    }

    if (step === 1) {
      if (!form.values.curriculum_id) {
        const noCurriculaExist = initialData.curricula.length === 0;
        notify({
          type: "error",
          title: noCurriculaExist ? "No Curriculum Created" : "No Curriculum Selected",
          message: noCurriculaExist
            ? "Create a curriculum first before setting up a school year."
            : "Please select a curriculum before proceeding.",
        });
        return false;
      }
      return true;
    }

    if (step === 2) {
      if (!curriculumDetail) return false;
      if (initialData.prevSy && form.values.step3Mode === null) {
        notify({
          type: "error",
          title: "No Setup Mode Selected",
          message: "Please choose how to set up classes — start fresh or replicate from the previous school year.",
        });
        return false;
      }
      const hasAnySses = curriculumDetail.grade_levels.some((gl) => gl.hasSsesSubjects);
      for (const gl of curriculumDetail.grade_levels) {
        const glSections = form.values.sections.filter(
          (s) => s.grade_level_id === gl.grade_level_id
        );
        const hasRegular = glSections.some((s) => s.section_type === "REGULAR");
        if (!hasRegular) {
          notify({
            type: "error",
            title: "Missing Regular Section",
            message: `${gl.display_name} must have at least one regular section.`,
            autoClose: 6000,
          });
          return false;
        }
        if (hasAnySses) {
          const hasSses = glSections.some((s) => s.section_type === "SSES");
          if (!hasSses) {
            notify({
              type: "error",
              title: "Missing SSES Section",
              message: `${gl.display_name} requires at least one SSES section.`,
              autoClose: 6000,
            });
            return false;
          }
        }
      }
      return true;
    }

    if (step === 3) {
      if (!curriculumDetail) return false;
      if (initialData.prevSy && form.values.step4Mode === null) {
        notify({
          type: "error",
          title: "No Setup Mode Selected",
          message: "Please choose how to assign faculty — start fresh or replicate from the previous school year.",
        });
        return false;
      }
      // Every cell must be filled (adviser + all applicable subjects per section)
      for (const section of form.values.sections) {
        const adviserKey: FacultyCellKey = `adviser:${section.tempId}`;
        if (!facultyDraft.get(adviserKey)) {
          notify({
            type: "error",
            title: "Incomplete Assignments",
            message: "All adviser cells must be filled before proceeding.",
          });
          return false;
        }
        const gl = curriculumDetail.grade_levels.find(
          (g) => g.grade_level_id === section.grade_level_id
        );
        if (!gl) continue;
        for (const sub of gl.subjects) {
          if (sub.subject_type === "SSES" && section.section_type !== "SSES") continue;
          const subKey: FacultyCellKey = `subject:${section.tempId}:${sub.curriculum_subject_id}`;
          if (!facultyDraft.get(subKey)) {
            notify({
              type: "error",
              title: "Incomplete Assignments",
              message: "All subject assignment cells must be filled before proceeding.",
            });
            return false;
          }
        }
      }
      return true;
    }

    if (step === 4) {
      if (!curriculumDetail) return false;
      if (initialData.prevSy && form.values.step5Mode === null) {
        notify({
          type: "error",
          title: "No Setup Mode Selected",
          message: "Please choose how to assign grade subject leaders — start fresh or replicate from the previous school year.",
        });
        return false;
      }
      for (const gl of curriculumDetail.grade_levels) {
        for (const sub of gl.subjects) {
          const key = `gsl:${gl.grade_level_id}:${sub.curriculum_subject_id}`;
          if (!gslDraft.get(key)) {
            notify({
              type: "error",
              title: "Incomplete Assignments",
              message: "All subjects must have a grade subject leader assigned before proceeding.",
            });
            return false;
          }
        }
      }
      return true;
    }

    if (step === 5) {
      if (!curriculumDetail) return false;
      if (initialData.prevSy && form.values.step6Mode === null) {
        notify({
          type: "error",
          title: "No Setup Mode Selected",
          message: "Please choose how to assign coordinators — start fresh or replicate from the previous school year.",
        });
        return false;
      }
      for (const group of curriculumDetail.subject_groups) {
        if (!coordinatorDraft.get(group.subject_group_id)) {
          notify({
            type: "error",
            title: "Incomplete Coordinators",
            message: "All subject groups must have a coordinator assigned.",
          });
          return false;
        }
      }
      return true;
    }

    return true;
  };

  const nextStep = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const valid = await validateStep(form.values.activeStep);
      if (!valid) return;
      // Pre-load snapshot when moving from Step 2 → 3 (if prevSy exists)
      if (form.values.activeStep === 1 && initialData.prevSy) {
        loadSnapshot();
      }
      form.setFieldValue("activeStep", form.values.activeStep + 1);
    } finally {
      busyRef.current = false;
    }
  };

  const prevStep = () => {
    form.setFieldValue("activeStep", form.values.activeStep - 1);
    setSubmitError(null);
  };

  const handleCancel = () => {
    if (isDirty) {
      modals.openConfirmModal({
        title: "Discard changes?",
        children: (
          <Text size="sm">
            You have unsaved changes. Leaving will discard all progress.
          </Text>
        ),
        labels: { confirm: "Discard", cancel: "Stay" },
        confirmProps: { color: "red" },
        onConfirm: () => {
          form.reset();
          router.replace("/school/year");
        },
        ...confirmModalProps,
      });
    } else {
      router.replace("/school/year");
    }
  };

  // ── Derived: teachingLoadByTeacher for MasterlistAssignmentModal ────────────
  const teachingLoadByTeacher = useMemo(() => {
    if (!curriculumDetail) return new Map();
    const map = new Map<string, { curriculum_subject_id: number; code: string; name: string; subject_type: "BOTH" | "SSES" }[]>();
    for (const [key, uid] of facultyDraft.entries()) {
      if (!uid || !key.startsWith("subject:")) continue;
      const parts = key.split(":");
      const csId = parseInt(parts[2], 10);
      let subjectInfo: { curriculum_subject_id: number; code: string; name: string; subject_type: "BOTH" | "SSES" } | undefined;
      for (const gl of curriculumDetail.grade_levels) {
        subjectInfo = gl.subjects.find((s) => s.curriculum_subject_id === csId);
        if (subjectInfo) break;
      }
      if (!subjectInfo) continue;
      if (!map.has(uid)) map.set(uid, []);
      const existing = map.get(uid)!;
      if (!existing.some((s) => s.curriculum_subject_id === csId)) {
        existing.push(subjectInfo);
      }
    }
    return map;
  }, [facultyDraft, curriculumDetail]);

  const assignedAdviserUids = useMemo(() => {
    const s = new Set<string>();
    for (const [key, uid] of facultyDraft.entries()) {
      if (uid && key.startsWith("adviser:")) s.add(uid);
    }
    return s;
  }, [facultyDraft]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleCreate = () => {
    modals.openConfirmModal({
      title: "Create School Year?",
      children: (
        <Text size="sm">
          This will create school year{" "}
          <strong>
            {form.values.start_year}–{parseInt(form.values.start_year) + 1}
          </strong>{" "}
          with {form.values.sections.length} class(es). This action cannot be undone.
        </Text>
      ),
      labels: { confirm: "Create School Year", cancel: "Cancel" },
      confirmProps: { style: { backgroundColor: "#4EAE4A" } },
      onConfirm: submitWizard,
    });
  };

  const submitWizard = async () => {
    if (!curriculumDetail) return;
    setSubmitting(true);
    setSubmitError(null);

    const startYear = parseInt(form.values.start_year, 10);

    const payload: CreateSchoolYearFullPayload = {
      start_year: startYear,
      end_year: startYear + 1,
      curriculum_id: form.values.curriculum_id!,
      num_quarters: form.values.num_quarters,
      sections: form.values.sections.map((section) => {
        const gl = curriculumDetail.grade_levels.find(
          (g) => g.grade_level_id === section.grade_level_id
        );
        const applicableSubjects = (gl?.subjects ?? []).filter(
          (sub) => sub.subject_type === "BOTH" || section.section_type === "SSES"
        );
        return {
          name: section.name,
          grade_level_id: section.grade_level_id,
          section_type: section.section_type,
          adviser_id: facultyDraft.get(`adviser:${section.tempId}`) ?? null,
          subjects: applicableSubjects.map((sub) => ({
            curriculum_subject_id: sub.curriculum_subject_id,
            teacher_id: facultyDraft.get(`subject:${section.tempId}:${sub.curriculum_subject_id}`)!,
          })),
        };
      }),
      coordinators: Array.from(coordinatorDraft.entries())
        .filter(([, uid]) => uid !== null)
        .map(([sgId, uid]) => ({ subject_group_id: sgId, user_id: uid! })),
      grade_subject_leaders: Array.from(gslDraft.entries())
        .filter(([, uid]) => uid !== null)
        .map(([key, uid]) => {
          const [, glId, csId] = key.split(":");
          return {
            grade_level_id: parseInt(glId, 10),
            curriculum_subject_id: parseInt(csId, 10),
            user_id: uid!,
          };
        }),
    };

    try {
      const res = await fetch("/api/schoolYear/create-full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.status === 409) {
        setSubmitError(
          `School year ${startYear}–${startYear + 1} already exists. Go back to Step 1 and choose a different start year.`
        );
        return;
      }

      if (!res.ok) {
        setSubmitError(data.error ?? "Failed to create school year. Please try again.");
        return;
      }

      notify({
        type: "success",
        title: "School Year Created",
        message: `School year ${startYear}–${startYear + 1} has been created successfully.`,
      });
      form.reset();
      setFacultyDraft(new Map());
      setExtraFacultyNames(new Map());
      setGslDraft(new Map());
      setExtraGslNames(new Map());
      setCoordinatorDraft(new Map());
      setExtraCoordinatorNames(new Map());
      router.replace("/school/year");
      router.refresh();
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step content ────────────────────────────────────────────────────────────
  const stepContent = (
    <>
      {form.values.activeStep === 0 && (
        <StepAcademicPeriod form={form} checkingYear={checkingYear} />
      )}
      {form.values.activeStep === 1 && (
        <StepSelectCurriculum
          form={form}
          curricula={initialData.curricula}
          prevSyCurriculumId={initialData.prevSy?.curriculum_id ?? null}
          curriculumDetail={curriculumDetail}
          loadingCurriculum={loadingCurriculum}
          onCurriculaRefresh={(list) => {
            // Curricula list refreshed via BroadcastChannel — update the prop reference
            // StepSelectCurriculum manages its own local state copy for this
          }}
        />
      )}
      {form.values.activeStep === 2 && curriculumDetail && (
        <StepDefineClasses
          form={form}
          curriculumDetail={curriculumDetail}
          prevSy={initialData.prevSy}
          snapshot={snapshotRef.current}
          snapshotLoading={snapshotLoading}
          onSnapshotNeeded={loadSnapshot}
          onFacultyDraftReset={() => setFacultyDraft(new Map())}
        />
      )}
      {form.values.activeStep === 3 && curriculumDetail && (
        <StepFacultyAssignment
          form={form}
          curriculumDetail={curriculumDetail}
          faculty={faculty}
          prevSy={initialData.prevSy}
          snapshot={snapshotRef.current}
          snapshotLoading={snapshotLoading}
          onSnapshotNeeded={loadSnapshot}
          facultyDraft={facultyDraft}
          setFacultyDraft={setFacultyDraft}
          teachingLoadByTeacher={teachingLoadByTeacher}
          assignedAdviserUids={assignedAdviserUids}
          extraFacultyNames={extraFacultyNames}
          setExtraFacultyNames={setExtraFacultyNames}
        />
      )}
      {form.values.activeStep === 4 && curriculumDetail && (
        <StepGradeSubjectLeaders
          form={form}
          curriculumDetail={curriculumDetail}
          faculty={faculty}
          prevSy={initialData.prevSy}
          snapshot={snapshotRef.current}
          snapshotLoading={snapshotLoading}
          onSnapshotNeeded={loadSnapshot}
          gslDraft={gslDraft}
          setGslDraft={setGslDraft}
          extraGslNames={extraGslNames}
          setExtraGslNames={setExtraGslNames}
        />
      )}
      {form.values.activeStep === 5 && curriculumDetail && (
        <StepSubjectCoordinators
          form={form}
          curriculumDetail={curriculumDetail}
          faculty={faculty}
          prevSy={initialData.prevSy}
          snapshot={snapshotRef.current}
          snapshotLoading={snapshotLoading}
          onSnapshotNeeded={loadSnapshot}
          coordinatorDraft={coordinatorDraft}
          setCoordinatorDraft={setCoordinatorDraft}
          extraCoordinatorNames={extraCoordinatorNames}
          setExtraCoordinatorNames={setExtraCoordinatorNames}
        />
      )}
      {form.values.activeStep === 6 && curriculumDetail && (
        <StepReviewCreate
          form={form}
          curriculumDetail={curriculumDetail}
          faculty={faculty}
          facultyDraft={facultyDraft}
          coordinatorDraft={coordinatorDraft}
          gslDraft={gslDraft}
          extraFacultyNames={extraFacultyNames}
          extraCoordinatorNames={extraCoordinatorNames}
          extraGslNames={extraGslNames}
          submitError={submitError}
        />
      )}
    </>
  );

  const isLastStep = form.values.activeStep === 6;

  const navButtons = (
    <WizardNavigationButtons
      onCancel={handleCancel}
      showPrevious={form.values.activeStep > 0}
      onPrevious={prevStep}
      previousDisabled={submitting}
      onPrimary={isLastStep ? handleCreate : nextStep}
      primaryLabel={isLastStep ? "Create School Year" : "Next"}
      primaryLoading={isLastStep ? submitting : checkingYear}
      stickyMobile
    />
  );

  const steps = [
    { label: "Step 1", description: "Academic Period" },
    { label: "Step 2", description: "Select Curriculum" },
    { label: "Step 3", description: "Define Classes" },
    { label: "Step 4", description: "Faculty Assignment" },
    { label: "Step 5", description: "Grade Subject Leaders" },
    { label: "Step 6", description: "Subject Coordinators" },
    { label: "Step 7", description: "Review & Create" },
  ];

  return (
    <Container fluid pt={isMobile ? 0 : "xl"} pb="xl" h="100%">
      {isMobile ? (
        <>
          <MobileStepIndicator
            activeStep={form.values.activeStep}
            totalSteps={steps.length}
            stepDescription={steps[form.values.activeStep].description}
          />
          {stepContent}
          {navButtons}
        </>
      ) : (
        <div style={{ display: "flex", gap: rem(32), height: "100%" }}>
          <div style={{ flexShrink: 0, width: "20%" }}>
            <Stepper
              active={form.values.activeStep}
              color="#4EAE4A"
              orientation="vertical"
            >
              {steps.map((s, i) => (
                <Stepper.Step key={i} label={s.label} description={s.description} />
              ))}
            </Stepper>
          </div>
          <div style={{ width: "70%" }}>
            {stepContent}
            {navButtons}
          </div>
        </div>
      )}
    </Container>
  );
}
