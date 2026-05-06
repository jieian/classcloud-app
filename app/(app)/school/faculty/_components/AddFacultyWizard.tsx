"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Container,
  Stepper,
  Text,
  rem,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notify } from "@/components/notificationIcon/notificationIcon";
import {
  IconBookOff,
  IconCalendarOff,
  IconLayoutOff,
} from "@tabler/icons-react";
import StepAssignAdvisory from "./StepAssignAdvisory";
import StepAssignGradeSection from "./StepAssignGradeSection";
import StepAssignSubject from "./StepAssignSubject";
import StepAssignCoordinator from "./StepAssignCoordinator";
import StepReview from "./StepReview";
import WizardNavigationButtons from "@/components/WizardNavigationButtons";
import WizardBlocker from "@/components/WizardBlocker";
import {
  assignAcademicLoad,
} from "../_lib/teachingLoadService";
import type { AddFacultyForm, WizardData } from "../_lib/teachingLoadService";

interface AddFacultyWizardProps {
  facultyUid: string;
  initialData: WizardData;
  isAddMode: boolean;
}

export default function AddFacultyWizard({ facultyUid, initialData, isAddMode }: AddFacultyWizardProps) {
  const router = useRouter();
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

  const TOTAL_STEPS = isAddMode ? 5 : 4;

  const [submitting, setSubmitting] = useState(false);

  // Pre-populate form from server-fetched data
  const advisoryId = initialData.current_advisory_section_id;
  const currentSections = [
    ...new Set(initialData.current_teaching_assignments.map((a) => a.section_id)),
  ];
  const currentSubjectAssignments = currentSections.map((sectionId) => ({
    section_id: sectionId,
    subject_ids: initialData.current_teaching_assignments
      .filter((a) => a.section_id === sectionId)
      .map((a) => a.subject_id),
  }));

  const form = useForm<AddFacultyForm>({
    initialValues: {
      activeStep: 0,
      advisory_section_id: advisoryId,
      selected_sections: currentSections,
      subject_assignments: currentSubjectAssignments,
      subject_group_id: null,
    },
  });

  // Sync subject_assignments when selected_sections changes (add/remove rows)
  function syncSubjectAssignments(selectedSections: number[]) {
    const current = form.values.subject_assignments;
    const synced = selectedSections.map((sectionId) => {
      const existing = current.find((a) => a.section_id === sectionId);
      return existing ?? { section_id: sectionId, subject_ids: [] };
    });
    form.setFieldValue("subject_assignments", synced);
  }

  const nextStep = () => {
    const step = form.values.activeStep;

    if (step === 1) {
      // Require at least one section
      if (form.values.selected_sections.length === 0) {
        notify({
          type: "error",
          title: "Validation Error",
          message: "Please select at least one section.",
        });
        return;
      }
      // Sync subject_assignments to match selected sections before moving to step 2
      syncSubjectAssignments(form.values.selected_sections);
    }

    if (step === 2) {
      // Require at least one subject per section
      const missingSubjects = form.values.subject_assignments.some(
        (a) => a.subject_ids.length === 0,
      );
      if (missingSubjects) {
        notify({
          type: "error",
          title: "Validation Error",
          message: "Please select at least one subject for each section.",
        });
        return;
      }
    }

    form.setFieldValue("activeStep", step + 1);
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
          router.replace("/school/faculty");
          router.refresh();
        },
        ...confirmModalProps,
      });
    } else {
      router.replace("/school/faculty");
      router.refresh();
    }
  };

  const facultyName = initialData.faculty
    ? `${initialData.faculty.first_name} ${initialData.faculty.last_name}`
    : "this faculty";

  const handleAssign = () => {
    if (!initialData?.active_sy_id) return;

    const totalSubjects = form.values.subject_assignments.reduce(
      (sum, a) => sum + a.subject_ids.length,
      0,
    );

    const coordinatorGroup = isAddMode && form.values.subject_group_id !== null
      ? initialData.coordinator_groups.find(
          (g) => g.subject_group_id === form.values.subject_group_id,
        )
      : null;

    modals.openConfirmModal({
      title: isAddMode ? "Add Faculty?" : "Save Changes?",
      children: (
        <Text size="sm">
          {isAddMode ? (
            <>
              This will add <strong>{facultyName}</strong> as faculty with{" "}
              <strong>{form.values.selected_sections.length} section(s)</strong> and{" "}
              <strong>{totalSubjects} subject(s)</strong>
              {form.values.advisory_section_id ? ", an advisory class" : ""}
              {coordinatorGroup ? `, and the Subject Coordinator role for ${coordinatorGroup.name}` : ""}
              .
            </>
          ) : (
            <>
              This will update the teaching load for <strong>{facultyName}</strong> to{" "}
              <strong>{form.values.selected_sections.length} section(s)</strong> and{" "}
              <strong>{totalSubjects} subject(s)</strong>
              {form.values.advisory_section_id ? " with an advisory class" : ""}
              . Existing assignments will be replaced.
            </>
          )}
        </Text>
      ),
      labels: { confirm: isAddMode ? "Add Faculty" : "Save Changes", cancel: "Cancel" },
      confirmProps: { style: { backgroundColor: "#4EAE4A" } },
      onConfirm: submitForm,
      ...confirmModalProps,
    });
  };

  const submitForm = async () => {
    if (!initialData?.active_sy_id) return;

    try {
      setSubmitting(true);

      // Build lookup: "grade_level_id-subject_id" → curriculum_subject_id
      const sectionGlMap = new Map(
        initialData.sections.map((s) => [s.section_id, s.grade_level_id]),
      );
      const csIdMap = new Map(
        initialData.subjects_by_grade_level.map((s) => [
          `${s.grade_level_id}-${s.subject_id}`,
          s.curriculum_subject_id,
        ]),
      );

      const flatSubjectAssignments = form.values.subject_assignments.flatMap((a) => {
        const gradeLevel = sectionGlMap.get(a.section_id);
        return a.subject_ids.flatMap((subjectId) => {
          const csId = csIdMap.get(`${gradeLevel}-${subjectId}`);
          return csId ? [{ section_id: a.section_id, curriculum_subject_id: csId }] : [];
        });
      });

      await assignAcademicLoad({
        faculty_id: facultyUid,
        advisory_section_id: form.values.advisory_section_id,
        subject_assignments: flatSubjectAssignments,
        // Only pass subject_group_id in add mode (undefined omits it in edit mode)
        ...(isAddMode ? { subject_group_id: form.values.subject_group_id } : {}),
      });

      notify({
        type: "success",
        title: isAddMode ? "Faculty Added" : "Changes Saved",
        message: isAddMode
          ? `${facultyName} has been added as faculty.`
          : `Teaching load for ${facultyName} has been updated.`,
      });

      router.replace("/school/faculty");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : isAddMode
            ? "Failed to add faculty. Please try again."
            : "Failed to save changes. Please try again.";
      notify({
        type: "error",
        title: isAddMode ? "Failed to Add Faculty" : "Failed to Save Changes",
        message,
        autoClose: false,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isNextDisabled = (() => {
    if (form.values.activeStep === 1) {
      return form.values.selected_sections.length === 0;
    }
    if (form.values.activeStep === 2) {
      return form.values.subject_assignments.some(
        (a) => a.subject_ids.length === 0,
      );
    }
    return false;
  })();

  const goBack = () => {
    router.replace("/school/faculty");
    router.refresh();
  };

  if (!initialData.active_sy_id) {
    return (
      <WizardBlocker
        icon={<IconCalendarOff size={30} />}
        title="No Active School Year"
        description="Teaching load cannot be assigned without an active school year."
        hint="Go to School → Year and set a school year as active."
        actionLabel="Back to Faculty"
        onAction={goBack}
      />
    );
  }

  if (initialData.sections.length === 0) {
    return (
      <WizardBlocker
        icon={<IconLayoutOff size={30} />}
        title="No Classes in Active School Year"
        description="The active school year has no classes yet. Classes must exist before you can assign a teaching load."
        hint="Go to School → Classes and create at least one class for the active school year."
        actionLabel="Back to Faculty"
        onAction={goBack}
      />
    );
  }

  if (initialData.subjects_by_grade_level.length === 0) {
    return (
      <WizardBlocker
        icon={<IconBookOff size={30} />}
        title="No Subjects Configured"
        description="There are no subjects assigned to any grade level. Subjects must exist before you can assign a teaching load."
        hint="Go to School → Subjects and add subjects to the relevant grade levels."
        actionLabel="Back to Faculty"
        onAction={goBack}
      />
    );
  }

  // Shared props for StepReview used in both mobile and desktop
  const reviewProps = {
    form,
    facultyName,
    gradeLevels: initialData.grade_levels,
    sections: initialData.sections,
    subjectsByGradeLevel: initialData.subjects_by_grade_level,
  };

  const stepContent = (() => {
    switch (form.values.activeStep) {
      case 0:
        return (
          <StepAssignAdvisory
            form={form}
            gradeLevels={initialData.grade_levels}
            sections={initialData.sections}
            facultyUid={facultyUid}
          />
        );
      case 1:
        return (
          <StepAssignGradeSection
            form={form}
            gradeLevels={initialData.grade_levels}
            sections={initialData.sections}
            subjectsByGradeLevel={initialData.subjects_by_grade_level}
            allAssignments={initialData.all_assignments}
            facultyUid={facultyUid}
          />
        );
      case 2:
        return (
          <StepAssignSubject
            form={form}
            gradeLevels={initialData.grade_levels}
            sections={initialData.sections}
            subjectsByGradeLevel={initialData.subjects_by_grade_level}
            allAssignments={initialData.all_assignments}
            facultyUid={facultyUid}
          />
        );
      case 3:
        return isAddMode ? (
          <StepAssignCoordinator
            form={form}
            coordinatorGroups={initialData.coordinator_groups}
            facultyUid={facultyUid}
          />
        ) : (
          <StepReview
            {...reviewProps}
            isAddMode={false}
            coordinatorGroups={[]}
          />
        );
      case 4:
        return (
          <StepReview
            {...reviewProps}
            isAddMode={true}
            coordinatorGroups={initialData.coordinator_groups}
          />
        );
      default:
        return null;
    }
  })();

  const isFinalStep = form.values.activeStep === TOTAL_STEPS - 1;
  const navButtons = (
    <WizardNavigationButtons
      onCancel={handleCancel}
      showPrevious={form.values.activeStep > 0}
      onPrevious={prevStep}
      onPrimary={isFinalStep ? handleAssign : nextStep}
      primaryLabel={isFinalStep ? "Assign Academic Load" : "Next"}
      primaryDisabled={isFinalStep ? !initialData.active_sy_id : isNextDisabled}
      primaryLoading={isFinalStep ? submitting : false}
    />
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
            <Stepper.Step label="Step 1" description="Advisory Class">
              <StepAssignAdvisory
                form={form}
                gradeLevels={initialData.grade_levels}
                sections={initialData.sections}
                facultyUid={facultyUid}
              />
            </Stepper.Step>
            <Stepper.Step label="Step 2" description="Grade & Section">
              <StepAssignGradeSection
                form={form}
                gradeLevels={initialData.grade_levels}
                sections={initialData.sections}
                subjectsByGradeLevel={initialData.subjects_by_grade_level}
                allAssignments={initialData.all_assignments}
                facultyUid={facultyUid}
              />
            </Stepper.Step>
            <Stepper.Step label="Step 3" description="Assign Subjects">
              <StepAssignSubject
                form={form}
                gradeLevels={initialData.grade_levels}
                sections={initialData.sections}
                subjectsByGradeLevel={initialData.subjects_by_grade_level}
                allAssignments={initialData.all_assignments}
                facultyUid={facultyUid}
              />
            </Stepper.Step>
            {isAddMode && (
              <Stepper.Step label="Step 4" description="Subject Coordinator Role">
                <StepAssignCoordinator
                  form={form}
                  coordinatorGroups={initialData.coordinator_groups}
                  facultyUid={facultyUid}
                />
              </Stepper.Step>
            )}
            <Stepper.Step
              label={isAddMode ? "Step 5" : "Step 4"}
              description={isAddMode ? "Review & Confirm" : "Review & Save"}
            >
              <StepReview
                {...reviewProps}
                isAddMode={isAddMode}
                coordinatorGroups={initialData.coordinator_groups}
              />
            </Stepper.Step>
          </Stepper>
          {navButtons}
        </>
      ) : (
        <div style={{ display: "flex", gap: rem(32), height: "100%" }}>
          {/* Left side: Stepper */}
          <div style={{ flexShrink: 0, width: "20%" }}>
            <Stepper
              active={form.values.activeStep}
              color="#4EAE4A"
              orientation="vertical"
            >
              <Stepper.Step label="Step 1" description="Advisory Class" />
              <Stepper.Step label="Step 2" description="Grade & Section" />
              <Stepper.Step label="Step 3" description="Assign Subjects" />
              {isAddMode && (
                <Stepper.Step label="Step 4" description="Subject Coordinator Role" />
              )}
              <Stepper.Step
                label={isAddMode ? "Step 5" : "Step 4"}
                description={isAddMode ? "Review & Confirm" : "Review & Save"}
              />
            </Stepper>
          </div>

          {/* Right side: Content */}
          <div style={{ flex: 1, width: "70%" }}>
            {stepContent}
            {navButtons}
          </div>
        </div>
      )}
    </Container>
  );
}
