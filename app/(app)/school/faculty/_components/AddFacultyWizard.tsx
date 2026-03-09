"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/BackButton";
import {
  Alert,
  Container,
  Stepper,
  Button,
  Group,
  Stack,
  Text,
  ThemeIcon,
  Title,
  rem,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconBookOff,
  IconCalendarOff,
  IconInfoCircle,
  IconLayoutOff,
} from "@tabler/icons-react";
import StepAssignAdvisory from "./StepAssignAdvisory";
import StepAssignGradeSection from "./StepAssignGradeSection";
import StepAssignSubject from "./StepAssignSubject";
import StepReview from "./StepReview";
import {
  assignAcademicLoad,
} from "../_lib/teachingLoadService";
import type { AddFacultyForm, WizardData } from "../_lib/teachingLoadService";

interface AddFacultyWizardProps {
  facultyUid: string;
  initialData: WizardData;
}

// ─── Blocker ──────────────────────────────────────────────────────────────────

function WizardBlocker({
  icon,
  title,
  description,
  hint,
  onBack,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  hint: string;
  onBack: () => void;
}) {
  return (
    <Container fluid py="xl">
      <Stack align="center" gap="md" py={48} maw={460} mx="auto">
        <ThemeIcon size={64} radius="xl" color="gray" variant="light">
          {icon}
        </ThemeIcon>
        <Title order={4} ta="center">
          {title}
        </Title>
        <Text size="sm" c="dimmed" ta="center">
          {description}
        </Text>
        <Alert
          color="blue"
          variant="light"
          icon={<IconInfoCircle size={16} />}
          w="100%"
        >
          {hint}
        </Alert>
        <BackButton onClick={onBack}>Back to Faculty</BackButton>
      </Stack>
    </Container>
  );
}

const TOTAL_STEPS = 4;

export default function AddFacultyWizard({ facultyUid, initialData }: AddFacultyWizardProps) {
  const router = useRouter();
  const isMobile = useMediaQuery("(max-width: 768px)");

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
    if (!initialData?.active_sy_id) return;

    const facultyName = initialData.faculty
      ? `${initialData.faculty.first_name} ${initialData.faculty.last_name}`
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
    if (!initialData?.active_sy_id) return;

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
        sy_id: initialData.active_sy_id,
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

  const goBack = () => {
    router.replace("/school/faculty");
    router.refresh();
  };

  if (!initialData.active_sy_id) {
    return (
      <WizardBlocker
        icon={<IconCalendarOff size={30} />}
        title="No Active School Year"
        description="Academic load cannot be assigned without an active school year."
        hint="Go to School → Year and set a school year as active."
        onBack={goBack}
      />
    );
  }

  if (initialData.sections.length === 0) {
    return (
      <WizardBlocker
        icon={<IconLayoutOff size={30} />}
        title="No Classes in Active School Year"
        description="The active school year has no classes yet. Classes must exist before you can assign an academic load."
        hint="Go to School → Classes and create at least one class for the active school year."
        onBack={goBack}
      />
    );
  }

  if (initialData.subjects_by_grade_level.length === 0) {
    return (
      <WizardBlocker
        icon={<IconBookOff size={30} />}
        title="No Subjects Configured"
        description="There are no subjects assigned to any grade level. Subjects must exist before you can assign an academic load."
        hint="Go to School → Subjects and add subjects to the relevant grade levels."
        onBack={goBack}
      />
    );
  }

  const facultyName = initialData.faculty
    ? `${initialData.faculty.first_name} ${initialData.faculty.last_name}`
    : "";

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
        return (
          <StepReview
            form={form}
            facultyName={facultyName}
            gradeLevels={initialData.grade_levels}
            sections={initialData.sections}
            subjectsByGradeLevel={initialData.subjects_by_grade_level}
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
          disabled={!initialData.active_sy_id}
          style={initialData.active_sy_id ? { backgroundColor: "#4EAE4A" } : undefined}
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
            <Stepper.Step label="Step 4" description="Review & Assign">
              <StepReview
                form={form}
                facultyName={facultyName}
                gradeLevels={initialData.grade_levels}
                sections={initialData.sections}
                subjectsByGradeLevel={initialData.subjects_by_grade_level}
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
