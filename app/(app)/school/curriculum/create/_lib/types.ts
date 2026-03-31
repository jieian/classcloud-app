export interface GradeLevel {
  grade_level_id: number;
  level_number: number;
  display_name: string;
}

export type WizardSubject =
  | {
      tempId: string;
      source: "existing";
      subject_id: number;
      code: string;
      name: string;
      description: string | null;
      subject_type: "BOTH" | "SSES";
      grade_level_id: number;
    }
  | {
      tempId: string;
      source: "new";
      code: string;
      name: string;
      description: string;
      subject_type: "BOTH" | "SSES";
      grade_level_id: number;
    };

export interface WizardSubjectGroup {
  tempId: string;
  name: string;
  description: string;
  memberTempIds: string[];
}

export interface CreateCurriculumForm {
  name: string;
  description: string;
  subjects: WizardSubject[];
  subject_groups: WizardSubjectGroup[];
  activeStep: number;
}
