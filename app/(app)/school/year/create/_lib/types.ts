export type QuarterCount = 2 | 3 | 4;

// ── Step 3: Sections ──────────────────────────────────────────────────────────

export interface WizardSection {
  tempId: string; // crypto.randomUUID(), client-only key
  name: string;
  grade_level_id: number;
  section_type: "SSES" | "REGULAR";
}

// ── Step 2: Curriculum data ───────────────────────────────────────────────────

export interface WizardCurriculumListItem {
  curriculum_id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export interface WizardCurriculumSubject {
  curriculum_subject_id: number;
  subject_id: number;
  code: string;
  name: string;
  description: string | null;
  subject_type: "BOTH" | "SSES";
}

export interface WizardSubjectGroupMember {
  curriculum_subject_id: number;
  code: string;
  name: string;
  subject_type: "BOTH" | "SSES";
}

export interface WizardSubjectGroup {
  subject_group_id: number;
  name: string;
  description: string | null;
  members: WizardSubjectGroupMember[];
}

export interface WizardGradeLevel {
  grade_level_id: number;
  level_number: number;
  display_name: string;
  subjects: WizardCurriculumSubject[];
  hasSsesSubjects: boolean; // pre-computed: any subject with subject_type === "SSES"
}

export interface WizardCurriculumDetail {
  curriculum_id: number;
  name: string;
  description: string | null;
  created_at: string;
  is_active: boolean;
  grade_levels: WizardGradeLevel[];
  subject_groups: WizardSubjectGroup[];
}

// ── Steps 4 & 5: Faculty and coordinator data ─────────────────────────────────

export interface WizardFacultyOption {
  uid: string;
  first_name: string;
  last_name: string;
}

// Faculty draft — Map<FacultyCellKey, uid | null> stored outside Mantine form
// Key formats: "adviser:{tempId}" | "subject:{tempId}:{csId}"
export type FacultyCellKey = string;

// Coordinator draft — subject_group_id → faculty uid | null
export type CoordinatorDraftMap = Map<number, string | null>;

// ── Mantine form shape ────────────────────────────────────────────────────────

export interface CreateSchoolYearForm {
  // Step 1
  start_year: string;
  num_quarters: QuarterCount;
  startYearLocked: boolean;

  // Step 2
  curriculum_id: number | null;

  // Step 3
  sections: WizardSection[];
  step3Mode: "scratch" | "replicate" | null;

  // Step 4
  step4Mode: "scratch" | "replicate" | null;

  // Step 5
  step5Mode: "scratch" | "replicate" | null;

  // Wizard progress
  activeStep: number;
}

// ── Previous SY snapshot (for "Replicate" mode) ───────────────────────────────

export interface PrevSySection {
  section_id: number;
  name: string;
  grade_level_id: number;
  section_type: "SSES" | "REGULAR";
  adviser_id: string | null;
}

export interface PrevSyAssignment {
  section_id: number;
  curriculum_subject_id: number;
  subject_id: number; // for cross-curriculum matching
  teacher_id: string;
}

export interface PrevSyCoordinator {
  subject_group_id: number;
  subject_group_name: string; // for name-matching across curricula
  user_id: string;
}

export interface PreviousSySnapshot {
  sy_id: number;
  curriculum_id: number | null;
  sections: PrevSySection[];
  assignments: PrevSyAssignment[];
  coordinators: PrevSyCoordinator[];
}

// ── Server prefetch shape (passed from page.tsx to wizard) ────────────────────

export interface WizardInitialData {
  prevSy: {
    sy_id: number;
    start_year: number;
    curriculum_id: number | null;
  } | null;
  curricula: WizardCurriculumListItem[];
  faculty: WizardFacultyOption[];
}

// ── RPC payload shapes (sent to /api/schoolYear/create-full) ─────────────────

export interface RpcSubjectAssignment {
  curriculum_subject_id: number;
  teacher_id: string;
}

export interface RpcSectionPayload {
  name: string;
  grade_level_id: number;
  section_type: "SSES" | "REGULAR";
  adviser_id: string | null;
  subjects: RpcSubjectAssignment[];
}

export interface RpcCoordinatorPayload {
  subject_group_id: number;
  user_id: string;
}

export interface CreateSchoolYearFullPayload {
  start_year: number;
  end_year: number;
  curriculum_id: number;
  num_quarters: number;
  sections: RpcSectionPayload[];
  coordinators: RpcCoordinatorPayload[];
}
