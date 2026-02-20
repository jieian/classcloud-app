/**
 * exam-supabase.ts
 * Bridge: exposes a named `supabase` client + all examination-system types
 * so that copied service files and components work by only changing the import path.
 */
import { createClientSupabaseClient } from './supabase/client';

export const supabase = createClientSupabaseClient();

// ─── Core table interfaces ────────────────────────────────────────────────────

export interface GradeLevel {
  grade_level_id: number;
  level_number: number;
  display_name: string;
}

export interface Subject {
  subject_id: number;
  name: string;
  code: string;
}

export interface SchoolYear {
  sy_id: number;
  year_range: string;
  is_active: boolean;
}

export interface Quarter {
  quarter_id: number;
  name: string;
  sy_id: number;
}

export interface Section {
  section_id: number;
  name: string;
  grade_level_id: number | null;
  sy_id: number | null;
  adviser_id: string | null;
  grade_levels?: { display_name: string } | null;
}

export interface AnswerKeyJsonb {
  total_questions: number;
  num_choices: number;
  answers: { [questionNumber: number]: string | null };
}

export interface Exam {
  exam_id: number;
  title: string;
  description: string | null;
  total_items: number;
  answer_key: AnswerKeyJsonb | null;
  exam_date: string;
  is_locked: boolean;
  subject_id: number | null;
  creator_teacher_id: string | null;
  quarter_id: number | null;
  created_at: string;
}

export interface ExamAssignment {
  id: number;
  exam_id: number;
  section_id: number;
}

export interface ExamWithRelations extends Exam {
  subjects: { name: string; code: string } | null;
  quarters: { name: string } | null;
  exam_assignments: {
    id: number;
    sections: {
      section_id: number;
      name: string;
      grade_levels: { display_name: string } | null;
    } | null;
  }[];
}

// ─── Scan / Analysis interfaces ───────────────────────────────────────────────

export interface ExamAttempt {
  attempt_id: number;
  exam_id: number;
  student_lrn: string | null;
  student_name: string | null;
  enrollment_id: number | null;
  section_id: number | null;
  responses: { [item: number]: string };
  score: number;
  total_items: number;
  scanned_at: string;
}

export interface ItemStatistic {
  stat_id: number;
  exam_id: number;
  item_number: number;
  difficulty_index: number | null;
  discrimination_index: number | null;
  choice_frequencies: { [choice: string]: number } | null;
  total_responses: number;
  computed_at: string;
}
