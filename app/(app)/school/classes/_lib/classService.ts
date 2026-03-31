import { getSupabase } from "@/lib/supabase/client";

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

export interface SectionCard {
  section_id: number;
  name: string;
  section_type: "SSES" | "REGULAR";
  adviser_id: string | null;
  adviser_name: string | null;
  student_count: number;
  grade_level_id: number;
}

interface RawSection {
  section_id: number;
  name: string;
  section_type: string;
  grade_level_id: number;
  adviser_id: string | null;
  users:
    | { first_name: string | null; last_name: string | null }
    | { first_name: string | null; last_name: string | null }[]
    | null;
}

interface RawEnrollment {
  section_id: number;
}

/** Active SY → otherwise the first item (ordered desc by start_year = latest). */
export function resolveDefaultSyId(
  years: SchoolYearOption[],
): number | null {
  return years.find((y) => y.is_active)?.sy_id ?? years[0]?.sy_id ?? null;
}

export async function fetchSchoolYears(): Promise<SchoolYearOption[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("school_years")
    .select("sy_id, year_range, is_active")
    .is("deleted_at", null)
    .order("start_year", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchGradeLevels(): Promise<GradeLevelRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("grade_levels")
    .select("grade_level_id, level_number, display_name")
    .order("level_number");

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Fetches all sections for a school year with adviser names and student counts.
 * Two parallel queries: sections (+ adviser join) and enrollment section_ids.
 */
export async function fetchSectionsForYear(
  syId: number,
): Promise<SectionCard[]> {
  const supabase = getSupabase();

  const [
    { data: sectionsData, error: secError },
    { data: enrollData, error: enrollError },
  ] = await Promise.all([
    supabase
      .from("sections")
      .select(
        "section_id, name, section_type, grade_level_id, adviser_id, users(first_name, last_name)",
      )
      .eq("sy_id", syId)
      .is("deleted_at", null),
    supabase
      .from("enrollments")
      .select("section_id")
      .eq("sy_id", syId)
      .is("deleted_at", null),
  ]);

  if (secError) throw new Error(secError.message);
  if (enrollError) throw new Error(enrollError.message);

  // Build student count map in O(n)
  const countMap: Record<number, number> = {};
  for (const e of (enrollData ?? []) as RawEnrollment[]) {
    countMap[e.section_id] = (countMap[e.section_id] ?? 0) + 1;
  }

  return ((sectionsData ?? []) as RawSection[]).map((s) => {
    const user = Array.isArray(s.users) ? s.users[0] : s.users;
    const adviserName = user
      ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || null
      : null;

    return {
      section_id: s.section_id,
      name: s.name,
      section_type: s.section_type as "SSES" | "REGULAR",
      adviser_id: s.adviser_id,
      adviser_name: adviserName,
      student_count: countMap[s.section_id] ?? 0,
      grade_level_id: s.grade_level_id,
    };
  });
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

export async function checkLrnExists(
  lrn: string,
  excludeLrn: string,
): Promise<boolean> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("students")
    .select("lrn")
    .eq("lrn", lrn)
    .neq("lrn", excludeLrn)
    .maybeSingle();
  return data !== null;
}

export async function updateStudent(
  currentLrn: string,
  data: {
    lrn: string;
    last_name: string;
    first_name: string;
    middle_name: string;
    sex: "M" | "F";
  },
): Promise<void> {
  const response = await fetch(`/api/students/${currentLrn}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error || "Failed to update student.");
  }
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
  /** Adviser of the from_section (null if unassigned) */
  from_adviser_name: string | null;
  to_section_name: string;
  to_grade_level_display: string;
  requester_name: string;
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

export async function checkStudentLrn(
  sectionId: number,
  lrn: string,
): Promise<LrnCheckResult> {
  const res = await fetch(
    `/api/classes/${sectionId}/students/check-lrn?lrn=${encodeURIComponent(lrn)}`,
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to check LRN.");
  return data as LrnCheckResult;
}

export async function addStudentToRoster(
  sectionId: number,
  payload: AddStudentPayload,
): Promise<void> {
  const res = await fetch(`/api/classes/${sectionId}/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to add student.");
}

// ─── Transfer Requests ────────────────────────────────────────────────────────

export async function createTransferRequest(payload: {
  lrn: string;
  from_section_id: number;
  to_section_id: number;
}): Promise<void> {
  const res = await fetch("/api/classes/transfer-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to submit transfer request.");
}


export async function fetchPendingTransferCount(): Promise<number> {
  const res = await fetch("/api/classes/transfer-requests/count", {
    cache: "no-store",
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return (data.count as number) ?? 0;
}

export async function approveTransferRequest(requestId: string): Promise<void> {
  const res = await fetch(
    `/api/classes/transfer-requests/${encodeURIComponent(requestId)}/approve`,
    { method: "POST" },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to approve transfer request.");
}

export async function rejectTransferRequest(
  requestId: string,
  notes?: string,
): Promise<void> {
  const res = await fetch(
    `/api/classes/transfer-requests/${encodeURIComponent(requestId)}/reject`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notes ?? "" }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to reject transfer request.");
}

export async function fetchIncomingTransferRequests(): Promise<TransferRequestItem[]> {
  const res = await fetch("/api/classes/transfer-requests?type=incoming", {
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to load incoming requests.");
  return (data.requests ?? []) as TransferRequestItem[];
}

export async function fetchOutgoingTransferRequests(): Promise<TransferRequestItem[]> {
  const res = await fetch("/api/classes/transfer-requests?type=outgoing", {
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to load outgoing requests.");
  return (data.requests ?? []) as TransferRequestItem[];
}

export async function cancelTransferRequest(requestId: string): Promise<void> {
  const res = await fetch(
    `/api/classes/transfer-requests/${encodeURIComponent(requestId)}/cancel`,
    { method: "POST" },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to cancel transfer request.");
}

export async function deleteStudentFromRoster(
  sectionId: number,
  lrn: string,
): Promise<void> {
  const response = await fetch("/api/students/delete", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ section_id: sectionId, lrn }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error || "Failed to delete student.");
  }
}

export async function fetchStudentRoster(sectionId: number): Promise<{
  section: StudentRosterSection;
  students: StudentRosterEntry[];
}> {
  const response = await fetch(`/api/classes/${sectionId}/students`, {
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error || "Failed to load student roster.");
  }
  return result as { section: StudentRosterSection; students: StudentRosterEntry[] };
}

export async function fetchSectionDetail(sectionId: number): Promise<{
  section: SectionDetail;
  subjects: SectionSubjectRow[];
}> {
  const response = await fetch(`/api/classes/${sectionId}`, {
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error || "Failed to load class details.");
  }
  return result as { section: SectionDetail; subjects: SectionSubjectRow[] };
}

/**
 * Returns the set of section_ids where the given teacher has an assignment
 * for the specified school year (via teacher_class_assignments).
 */
export async function fetchTeacherAssignedSectionIds(
  uid: string,
  syId: number,
): Promise<Set<number>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("teacher_class_assignments")
    .select("section_id, sections!inner(sy_id)")
    .eq("teacher_id", uid)
    .eq("sections.sy_id", syId)
    .is("deleted_at", null);

  if (error) return new Set();
  return new Set(
    (data ?? []).map((r: { section_id: number }) => r.section_id),
  );
}

export async function fetchTeacherClassAssignments(
  uid: string,
): Promise<{ section_id: number; curriculum_subject_id: number; subject_id: number }[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("teacher_class_assignments")
    .select("section_id, curriculum_subject_id, curriculum_subjects!inner(subject_id)")
    .eq("teacher_id", uid)
    .is("deleted_at", null);

  if (error) return [];
  return ((data ?? []) as any[]).map((r: any) => ({
    section_id: r.section_id as number,
    curriculum_subject_id: r.curriculum_subject_id as number,
    subject_id: (r.curriculum_subjects as any)?.subject_id as number,
  }));
}

export async function fetchAvailableAdviserCandidates(
  includeAssigned = false,
): Promise<AdviserCandidate[]> {
  const params = new URLSearchParams();
  if (includeAssigned) {
    params.set("include_assigned", "true");
  }

  const response = await fetch(
    `/api/classes/adviser-candidates${params.toString() ? `?${params.toString()}` : ""}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  const result = await response.json();
  if (!response.ok) {
    throw new Error(
      result?.error || "Failed to load eligible adviser candidates.",
    );
  }

  return (result?.data as AdviserCandidate[]) ?? [];
}

export async function setSectionAdviser(payload: {
  section_id: number;
  adviser_id: string | null;
}): Promise<void> {
  const response = await fetch("/api/classes/assign-adviser", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error || "Failed to update class adviser.");
  }
}

export async function checkSectionNameExists(
  gradeLevelId: number,
  name: string,
  excludeSectionId: number,
): Promise<boolean> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("sections")
    .select("section_id")
    .eq("grade_level_id", gradeLevelId)
    .ilike("name", name)
    .neq("section_id", excludeSectionId)
    .is("deleted_at", null)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export async function archiveSection(sectionId: number): Promise<void> {
  const response = await fetch(`/api/classes/${sectionId}`, {
    method: "DELETE",
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error || "Failed to archive section.");
  }
}

export async function assignSubjectTeachers(
  sectionId: number,
  assignments: { curriculum_subject_id: number; teacher_id: string | null }[],
): Promise<void> {
  const response = await fetch(`/api/classes/${sectionId}/assign-subject-teachers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignments }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error || "Failed to save subject teacher assignments.");
  }
}

export interface SectionCheckResult {
  available: boolean;
  conflict?: "name" | "sses";
  error?: string;
}

export async function checkSectionAvailability(data: {
  name: string;
  grade_level_id: number;
  section_type: "REGULAR" | "SSES";
}): Promise<SectionCheckResult> {
  const response = await fetch("/api/classes/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Failed to validate class.");
  }
  return result as SectionCheckResult;
}

export async function createSection(data: {
  name: string;
  grade_level_id: number;
  section_type: "REGULAR" | "SSES";
}): Promise<{ section_id: number }> {
  const response = await fetch("/api/classes/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Failed to create class.");
  }
  return result as { section_id: number };
}

export async function renameSectionName(
  sectionId: number,
  name: string,
): Promise<void> {
  const response = await fetch(`/api/classes/${sectionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error || "Failed to rename section.");
  }
}
