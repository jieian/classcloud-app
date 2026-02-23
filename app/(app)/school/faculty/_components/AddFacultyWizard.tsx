"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Container, Stepper, Button, Group, Text, Skeleton, Box, rem } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import StepAssignAdvisory from "./StepAssignAdvisory";
import StepAssignGradeSection from "./StepAssignGradeSection";
import StepAssignSubject from "./StepAssignSubject";
import StepReview from "./StepReview";
import {
  fetchWizardData,
  assignAcademicLoad,
} from "../_lib/teachingLoadService";
import type { AddFacultyForm, WizardData } from "../_lib/teachingLoadService";

interface AddFacultyWizardProps {
  facultyUid: string;
}

const TOTAL_STEPS = 4;

function StepperItemSkeleton() {
  return (
    <Group align="flex-start" gap="sm" mb="xl" wrap="nowrap">
      <Skeleton height={36} width={36} circle />
      <Box pt={4}>
        <Skeleton height={12} width={60} mb={6} radius="sm" />
        <Skeleton height={10} width={100} radius="sm" />
      </Box>
    </Group>
  );
}

function GradeLevelBarSkeleton() {
  return (
    <Box mb="xs">
      <Skeleton height={40} radius={8} mb={6} />
    </Box>
  );
}

function WizardSkeleton({ isMobile }: { isMobile: boolean | undefined }) {
  const stepperColumn = (
    <Box>
      <StepperItemSkeleton />
      <StepperItemSkeleton />
      <StepperItemSkeleton />
      <StepperItemSkeleton />
    </Box>
  );

  const contentColumn = (
    <Box>
      {/* Title */}
      <Skeleton height={24} width="45%" mb="xs" radius="sm" />
      {/* Subtitle */}
      <Skeleton height={14} width="65%" mb="lg" radius="sm" />

      {/* Card */}
      <Box p="lg" style={{ border: "1px solid #e0e0e0", borderRadius: "8px" }}>
        <GradeLevelBarSkeleton />
        {/* Rows under first bar */}
        <Box pl="md" mb="md">
          {[1, 2, 3].map((i) => (
            <Group key={i} mb="xs" gap="xs" align="center">
              <Skeleton height={16} width={16} radius="sm" />
              <Skeleton height={14} width={120} radius="sm" />
            </Group>
          ))}
        </Box>

        <GradeLevelBarSkeleton />
        <Box pl="md" mb="md">
          {[1, 2].map((i) => (
            <Group key={i} mb="xs" gap="xs" align="center">
              <Skeleton height={16} width={16} radius="sm" />
              <Skeleton height={14} width={100} radius="sm" />
            </Group>
          ))}
        </Box>

        <GradeLevelBarSkeleton />
      </Box>

      {/* Nav buttons */}
      <Group justify="flex-end" mt="xl" gap="sm">
        <Skeleton height={36} width={80} radius="sm" />
        <Skeleton height={36} width={80} radius="sm" />
      </Group>
    </Box>
  );

  if (isMobile) {
    return (
      <Container fluid py="xl">
        {stepperColumn}
        {contentColumn}
      </Container>
    );
  }

  return (
    <Container fluid py="xl">
      <div style={{ display: "flex", gap: rem(32) }}>
        <div style={{ flexShrink: 0, width: "20%" }}>{stepperColumn}</div>
        <div style={{ flex: 1, width: "70%" }}>{contentColumn}</div>
      </div>
    </Container>
  );
}

export default function AddFacultyWizard({ facultyUid }: AddFacultyWizardProps) {
  const router = useRouter();
  const isMobile = useMediaQuery("(max-width: 768px)");

  const [wizardData, setWizardData] = useState<WizardData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<AddFacultyForm>({
    initialValues: {
      activeStep: 0,
      advisory_section_id: null,
      selected_sections: [],
      subject_assignments: [],
    },
  });

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facultyUid]);

  async function loadData() {
    try {
      setLoadingData(true);
      const data = await fetchWizardData(facultyUid);
      setWizardData(data);

      // Pre-populate with current assignments
      const advisoryId = data.current_advisory_section_id;
      const currentSections = [
        ...new Set(data.current_teaching_assignments.map((a) => a.section_id)),
      ];
      const currentSubjectAssignments = currentSections.map((sectionId) => ({
        section_id: sectionId,
        subject_ids: data.current_teaching_assignments
          .filter((a) => a.section_id === sectionId)
          .map((a) => a.subject_id),
      }));

      form.setValues({
        activeStep: 0,
        advisory_section_id: advisoryId,
        selected_sections: currentSections,
        subject_assignments: currentSubjectAssignments,
      });
      form.resetDirty({
        activeStep: 0,
        advisory_section_id: advisoryId,
        selected_sections: currentSections,
        subject_assignments: currentSubjectAssignments,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load faculty data.";
      notifications.show({
        title: "Error",
        message,
        color: "red",
        autoClose: false,
      });
    } finally {
      setLoadingData(false);
    }
  }

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
        notifications.show({
          title: "Validation Error",
          message: "Please select at least one section.",
          color: "red",
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
        notifications.show({
          title: "Validation Error",
          message: "Please select at least one subject for each section.",
          color: "red",
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
      });
    } else {
      router.replace("/school/faculty");
      router.refresh();
    }
  };

  const handleAssign = () => {
    if (!wizardData?.active_sy_id) return;

    const facultyName = wizardData.faculty
      ? `${wizardData.faculty.first_name} ${wizardData.faculty.last_name}`
      : "this faculty";

    const totalSubjects = form.values.subject_assignments.reduce(
      (sum, a) => sum + a.subject_ids.length,
      0,
    );

    modals.openConfirmModal({
      title: "Assign Academic Load?",
      children: (
        <Text size="sm">
          This will assign{" "}
          <strong>
            {form.values.selected_sections.length} section(s)
          </strong>{" "}
          and <strong>{totalSubjects} subject(s)</strong> to{" "}
          <strong>{facultyName}</strong>
          {form.values.advisory_section_id ? " with an advisory class" : ""}.
          Existing assignments will be replaced.
        </Text>
      ),
      labels: { confirm: "Assign Academic Load", cancel: "Cancel" },
      confirmProps: { style: { backgroundColor: "#4EAE4A" } },
      onConfirm: submitForm,
    });
  };

  const submitForm = async () => {
    if (!wizardData?.active_sy_id) return;

    try {
      setSubmitting(true);

      const flatSubjectAssignments = form.values.subject_assignments.flatMap(
        (a) =>
          a.subject_ids.map((subjectId) => ({
            section_id: a.section_id,
            subject_id: subjectId,
          })),
      );

      await assignAcademicLoad({
        faculty_id: facultyUid,
        sy_id: wizardData.active_sy_id,
        advisory_section_id: form.values.advisory_section_id,
        subject_assignments: flatSubjectAssignments,
      });

      notifications.show({
        title: "Success",
        message: "Academic load assigned successfully.",
        color: "green",
      });

      router.replace("/school/faculty");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to assign academic load. Please try again.";
      notifications.show({
        title: "Error",
        message,
        color: "red",
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

  if (loadingData) {
    return <WizardSkeleton isMobile={isMobile} />;
  }

  if (!wizardData) return null;

  const facultyName = wizardData.faculty
    ? `${wizardData.faculty.first_name} ${wizardData.faculty.last_name}`
    : "";

  const stepContent = (() => {
    switch (form.values.activeStep) {
      case 0:
        return (
          <StepAssignAdvisory
            form={form}
            gradeLevels={wizardData.grade_levels}
            sections={wizardData.sections}
            facultyUid={facultyUid}
          />
        );
      case 1:
        return (
          <StepAssignGradeSection
            form={form}
            gradeLevels={wizardData.grade_levels}
            sections={wizardData.sections}
            subjectsByGradeLevel={wizardData.subjects_by_grade_level}
            allAssignments={wizardData.all_assignments}
            facultyUid={facultyUid}
          />
        );
      case 2:
        return (
          <StepAssignSubject
            form={form}
            gradeLevels={wizardData.grade_levels}
            sections={wizardData.sections}
            subjectsByGradeLevel={wizardData.subjects_by_grade_level}
            allAssignments={wizardData.all_assignments}
            facultyUid={facultyUid}
          />
        );
      case 3:
        return (
          <StepReview
            form={form}
            facultyName={facultyName}
            gradeLevels={wizardData.grade_levels}
            sections={wizardData.sections}
            subjectsByGradeLevel={wizardData.subjects_by_grade_level}
          />
        );
      default:
        return null;
    }
  })();

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

      {form.values.activeStep < TOTAL_STEPS - 1 ? (
        <Button
          onClick={nextStep}
          disabled={isNextDisabled}
          style={isNextDisabled ? undefined : { backgroundColor: "#4EAE4A" }}
        >
          Next
        </Button>
      ) : (
        <Button
          onClick={handleAssign}
          loading={submitting}
          disabled={!wizardData.active_sy_id}
          style={wizardData.active_sy_id ? { backgroundColor: "#4EAE4A" } : undefined}
        >
          Assign Academic Load
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
            <Stepper.Step label="Step 1" description="Advisory Class">
              <StepAssignAdvisory
                form={form}
                gradeLevels={wizardData.grade_levels}
                sections={wizardData.sections}
                facultyUid={facultyUid}
              />
            </Stepper.Step>
            <Stepper.Step label="Step 2" description="Grade & Section">
              <StepAssignGradeSection
                form={form}
                gradeLevels={wizardData.grade_levels}
                sections={wizardData.sections}
                subjectsByGradeLevel={wizardData.subjects_by_grade_level}
                allAssignments={wizardData.all_assignments}
                facultyUid={facultyUid}
              />
            </Stepper.Step>
            <Stepper.Step label="Step 3" description="Assign Subjects">
              <StepAssignSubject
                form={form}
                gradeLevels={wizardData.grade_levels}
                sections={wizardData.sections}
                subjectsByGradeLevel={wizardData.subjects_by_grade_level}
                allAssignments={wizardData.all_assignments}
                facultyUid={facultyUid}
              />
            </Stepper.Step>
            <Stepper.Step label="Step 4" description="Review & Assign">
              <StepReview
                form={form}
                facultyName={facultyName}
                gradeLevels={wizardData.grade_levels}
                sections={wizardData.sections}
                subjectsByGradeLevel={wizardData.subjects_by_grade_level}
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
              <Stepper.Step label="Step 4" description="Review & Assign" />
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
