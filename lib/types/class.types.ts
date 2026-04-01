// ─── School Year / Grade Level ────────────────────────────────────────────────

export interface SchoolYearOption {
  sy_id: number;
  year_range: string;
  is_active: boolean;
}

export interface GradeLevelRow {
  grade_level_id: number;
  level_number: number;
  display_name: string;
}

// ─── Sections ─────────────────────────────────────────────────────────────────

export interface SectionCard {
  section_id: number;
  name: string;
  section_type: "SSES" | "REGULAR";
  adviser_id: string | null;
  adviser_name: string | null;
  student_count: number;
  grade_level_id: number;
}

export interface SectionDetail {
  section_id: number;
  name: string;
  section_type: "SSES" | "REGULAR";
  adviser_id: string | null;
  adviser_name: string | null;
  grade_level_id: number;
  grade_level_display: string;
  student_count: number;
}

export interface SectionSubjectRow {
  curriculum_subject_id: number;
  subject_id: number;
  code: string;
  name: string;
  assigned_teacher: string | null;
  assigned_teacher_id: string | null;
}

export interface SectionCheckResult {
  available: boolean;
  conflict?: "name" | "sses";
  error?: string;
}

// ─── Advisers ─────────────────────────────────────────────────────────────────

export interface AdviserCandidateRole {
  role_id: number;
  name: string;
  is_faculty: boolean;
}

export interface AdviserCandidate {
  uid: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  roles: AdviserCandidateRole[];
}

// ─── Students / Roster ────────────────────────────────────────────────────────

export interface StudentRosterEntry {
  enrollment_id: number;
  lrn: string;
  full_name: string;
  sex: "M" | "F";
}

export interface StudentRosterSection {
  section_id: number;
  name: string;
  grade_level_display: string;
  adviser_id: string | null;
}

// ─── Add Student ──────────────────────────────────────────────────────────────

export type LrnCheckStatus =
  | "not_found"
  | "active"
  | "deleted"
  | "already_enrolled"
  | "enrolled_elsewhere";

export interface LrnCheckStudent {
  lrn: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  sex: "M" | "F";
  full_name: string;
}

export interface LrnCheckCurrentSection {
  section_id: number;
  name: string;
  grade_level_display: string;
  /** Does the from_section have an assigned adviser? */
  has_adviser: boolean;
  /** Is the requesting user also the adviser of the from_section? (auto-approve) */
  self_adviser: boolean;
  /** Is there already a PENDING transfer request for this student? */
  has_pending_request: boolean;
}

export interface LrnCheckResult {
  status: LrnCheckStatus;
  student: LrnCheckStudent | null;
  /** Populated only when status === "enrolled_elsewhere" */
  current_section?: LrnCheckCurrentSection;
}

export type AddStudentAction =
  | "new"
  | "enroll"
  | "update_enroll"
  | "restore_enroll"
  | "restore_update_enroll"
  | "move"
  | "update_move";

export interface AddStudentPayload {
  action: AddStudentAction;
  lrn: string;
  last_name?: string;
  first_name?: string;
  middle_name?: string;
  sex?: "M" | "F";
}

// ─── Transfer Requests ────────────────────────────────────────────────────────

export type TransferRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export type CancellationReason =
  | "STUDENT_UNENROLLED"
  | "SECTION_DELETED"
  | "REQUESTER_DEACTIVATED"
  | "PERMISSION_REVOKED"
  | "MOVED_BY_ADMIN"
  | "EXPIRED"
  | "MANUAL";

/** Full shape returned by /api/classes/transfer-requests?type=incoming|outgoing */
export interface TransferRequestItem {
  request_id: string;
  lrn: string;
  status: TransferRequestStatus;
  from_section_id: number;
  to_section_id: number;
  requested_at: string;
  expires_at: string;
  reviewed_at: string | null;
  notes: string | null;
  cancellation_reason: CancellationReason | null;
  student_full_name: string;
  student_sex: "M" | "F";
  from_section_name: string;
  from_grade_level_display: string;
  to_section_name: string;
  to_grade_level_display: string;
  requester_name: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface NotificationItem {
  notification_id: string;
  type: string;
  title: string;
  body: string | null;
  reference_id: string | null;
  reference_type: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
}
