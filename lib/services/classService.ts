import type {
  SchoolYearOption,
  GradeLevelRow,
  SectionDetail,
  SectionSubjectRow,
  AdviserCandidate,
  StudentRosterEntry,
  StudentRosterSection,
  LrnCheckResult,
  AddStudentPayload,
  TransferRequestItem,
  SectionCheckResult,
  NotificationItem,
} from "@/lib/types/class.types";

export type {
  SchoolYearOption,
  GradeLevelRow,
  SectionCard,
  SectionDetail,
  SectionSubjectRow,
  AdviserCandidateRole,
  AdviserCandidate,
  StudentRosterEntry,
  StudentRosterSection,
  LrnCheckStatus,
  LrnCheckStudent,
  LrnCheckCurrentSection,
  TransferRequestStatus,
  CancellationReason,
  TransferRequestItem,
  LrnCheckResult,
  AddStudentAction,
  AddStudentPayload,
  SectionCheckResult,
  NotificationItem,
} from "@/lib/types/class.types";

type ApiJson = Record<string, unknown>;
type ParsedResponsePayload = {
  json: unknown;
  rawText: string | null;
};

async function readResponsePayload(
  response: Response,
): Promise<ParsedResponsePayload> {
  const rawText = await response.text();
  if (!rawText) return { json: null, rawText: null };

  try {
    return { json: JSON.parse(rawText), rawText };
  } catch {
    return { json: null, rawText };
  }
}

function asApiJson(payload: unknown): ApiJson {
  return payload && typeof payload === "object" ? (payload as ApiJson) : {};
}

function getErrorMessageFromPayload(
  parsed: ParsedResponsePayload,
  fallback: string,
): string {
  const payload = asApiJson(parsed.json);
  const error = payload.error;
  if (typeof error === "string" && error.trim()) return error;

  const message = payload.message;
  if (typeof message === "string" && message.trim()) return message;

  if (parsed.rawText && parsed.rawText.trim()) {
    return parsed.rawText.slice(0, 200);
  }

  return fallback;
}

/** Active SY → otherwise the first item (ordered desc by start_year = latest). */
export function resolveDefaultSyId(
  years: SchoolYearOption[],
): number | null {
  return years.find((y) => y.is_active)?.sy_id ?? years[0]?.sy_id ?? null;
}

export async function fetchSchoolYears(): Promise<SchoolYearOption[]> {
  const res = await fetch("/api/school-years");
  const parsed = await readResponsePayload(res);
  if (!res.ok) {
    throw new Error(
      getErrorMessageFromPayload(parsed, "Failed to load school years."),
    );
  }
  return (asApiJson(parsed.json).schoolYears as SchoolYearOption[]) ?? [];
}

export async function fetchGradeLevels(): Promise<GradeLevelRow[]> {
  const res = await fetch("/api/grade-levels");
  const parsed = await readResponsePayload(res);
  if (!res.ok) {
    throw new Error(
      getErrorMessageFromPayload(parsed, "Failed to load grade levels."),
    );
  }
  return (asApiJson(parsed.json).gradeLevels as GradeLevelRow[]) ?? [];
}

export async function checkLrnExists(
  lrn: string,
  excludeLrn: string,
): Promise<boolean> {
  const params = new URLSearchParams({ lrn });
  if (excludeLrn) params.set("exclude", excludeLrn);
  const res = await fetch(`/api/students/check-lrn?${params.toString()}`);
  if (!res.ok) return false;
  const parsed = await readResponsePayload(res);
  return asApiJson(parsed.json).exists === true;
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
  const parsed = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(
      getErrorMessageFromPayload(parsed, "Failed to update student."),
    );
  }
}

export async function checkStudentLrn(
  sectionId: number,
  lrn: string,
): Promise<LrnCheckResult> {
  const res = await fetch(
    `/api/classes/${sectionId}/students/check-lrn?lrn=${encodeURIComponent(lrn)}`,
  );
  const parsed = await readResponsePayload(res);
  if (!res.ok) {
    throw new Error(getErrorMessageFromPayload(parsed, "Failed to check LRN."));
  }
  if (!parsed.json || typeof parsed.json !== "object") {
    throw new Error("Invalid response while checking LRN.");
  }
  return parsed.json as LrnCheckResult;
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
  const parsed = await readResponsePayload(res);
  if (!res.ok) {
    throw new Error(
      getErrorMessageFromPayload(parsed, "Failed to add student."),
    );
  }
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
  const parsed = await readResponsePayload(res);
  if (!res.ok) {
    throw new Error(
      getErrorMessageFromPayload(parsed, "Failed to submit transfer request."),
    );
  }
}

export async function fetchPendingTransferCount(): Promise<number> {
  const res = await fetch("/api/classes/transfer-requests/count", {
    cache: "no-store",
  });
  if (!res.ok) return 0;
  const parsed = await readResponsePayload(res);
  const data = asApiJson(parsed.json);
  return typeof data.count === "number" ? data.count : 0;
}

export async function approveTransferRequest(requestId: string): Promise<void> {
  const res = await fetch(
    `/api/classes/transfer-requests/${encodeURIComponent(requestId)}/approve`,
    { method: "POST" },
  );
  const parsed = await readResponsePayload(res);
  if (!res.ok) {
    throw new Error(
      getErrorMessageFromPayload(parsed, "Failed to approve transfer request."),
    );
  }
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
  const parsed = await readResponsePayload(res);
  if (!res.ok) {
    throw new Error(
      getErrorMessageFromPayload(parsed, "Failed to reject transfer request."),
    );
  }
}

export async function fetchIncomingTransferRequests(): Promise<TransferRequestItem[]> {
  const res = await fetch("/api/classes/transfer-requests?type=incoming", {
    cache: "no-store",
  });
  const parsed = await readResponsePayload(res);
  if (!res.ok) {
    throw new Error(
      getErrorMessageFromPayload(parsed, "Failed to load incoming requests."),
    );
  }
  const data = asApiJson(parsed.json);
  return (data.requests ?? []) as TransferRequestItem[];
}

export async function fetchOutgoingTransferRequests(): Promise<TransferRequestItem[]> {
  const res = await fetch("/api/classes/transfer-requests?type=outgoing", {
    cache: "no-store",
  });
  const parsed = await readResponsePayload(res);
  if (!res.ok) {
    throw new Error(
      getErrorMessageFromPayload(parsed, "Failed to load outgoing requests."),
    );
  }
  const data = asApiJson(parsed.json);
  return (data.requests ?? []) as TransferRequestItem[];
}

export async function cancelTransferRequest(requestId: string): Promise<void> {
  const res = await fetch(
    `/api/classes/transfer-requests/${encodeURIComponent(requestId)}/cancel`,
    { method: "POST" },
  );
  const parsed = await readResponsePayload(res);
  if (!res.ok) {
    throw new Error(
      getErrorMessageFromPayload(parsed, "Failed to cancel transfer request."),
    );
  }
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
  const parsed = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(
      getErrorMessageFromPayload(parsed, "Failed to delete student."),
    );
  }
}

export async function fetchStudentRoster(sectionId: number): Promise<{
  section: StudentRosterSection;
  students: StudentRosterEntry[];
}> {
  const response = await fetch(`/api/classes/${sectionId}/students`, {
    cache: "no-store",
  });
  const parsed = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(
      getErrorMessageFromPayload(parsed, "Failed to load student roster."),
    );
  }
  if (!parsed.json || typeof parsed.json !== "object") {
    throw new Error("Invalid response while loading student roster.");
  }
  return parsed.json as {
    section: StudentRosterSection;
    students: StudentRosterEntry[];
  };
}

export async function fetchSectionDetail(sectionId: number): Promise<{
  section: SectionDetail;
  subjects: SectionSubjectRow[];
}> {
  const response = await fetch(`/api/classes/${sectionId}`, {
    cache: "no-store",
  });
  const parsed = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(
      getErrorMessageFromPayload(parsed, "Failed to load class details."),
    );
  }
  if (!parsed.json || typeof parsed.json !== "object") {
    throw new Error("Invalid response while loading class details.");
  }
  return parsed.json as { section: SectionDetail; subjects: SectionSubjectRow[] };
}

/**
 * Returns the caller's own active teaching assignments (all school years).
 * The uid is derived from the session server-side, so callers no longer pass
 * one — a user can only read their own assignments.
 */
export async function fetchTeacherClassAssignments(): Promise<
  { section_id: number; curriculum_subject_id: number; subject_id: number }[]
> {
  const res = await fetch("/api/me/teaching-assignments");
  if (!res.ok) return [];
  const parsed = await readResponsePayload(res);
  return (asApiJson(parsed.json).assignments as {
    section_id: number;
    curriculum_subject_id: number;
    subject_id: number;
  }[]) ?? [];
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

  const parsed = await readResponsePayload(response);
  const result = asApiJson(parsed.json);
  if (!response.ok) {
    throw new Error(
      getErrorMessageFromPayload(
        parsed,
        "Failed to load eligible adviser candidates.",
      ),
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

  const parsed = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(
      getErrorMessageFromPayload(parsed, "Failed to update class adviser."),
    );
  }
}

export async function checkSectionNameExists(
  gradeLevelId: number,
  name: string,
  excludeSectionId: number,
): Promise<boolean> {
  const params = new URLSearchParams({
    gradeLevelId: String(gradeLevelId),
    name,
    excludeSectionId: String(excludeSectionId),
  });
  const res = await fetch(`/api/classes/check-name?${params.toString()}`);
  if (!res.ok) return false;
  const parsed = await readResponsePayload(res);
  return asApiJson(parsed.json).exists === true;
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

  const parsed = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(
      getErrorMessageFromPayload(
        parsed,
        "Failed to save subject teacher assignments.",
      ),
    );
  }
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
  const parsed = await readResponsePayload(response);
  const result = asApiJson(parsed.json);
  if (!response.ok) {
    throw new Error(getErrorMessageFromPayload(parsed, "Failed to validate class."));
  }
  return result as unknown as SectionCheckResult;
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
  const parsed = await readResponsePayload(response);
  const result = asApiJson(parsed.json);
  if (!response.ok) {
    throw new Error(getErrorMessageFromPayload(parsed, "Failed to create class."));
  }
  return result as { section_id: number };
}

// ─── Notifications ────────────────────────────────────────────────────────────

/**
 * Fetches the current user's notifications, unread-first by recency.
 *
 * @param referenceType - when set, keeps only notifications of this reference_type
 *   (e.g. "transfer_request" for the Transfer Requests page). Applied BEFORE the
 *   limit so the cap never hides matching items behind newer non-matching ones.
 * @param limit - max items to return (default 5 for the global bell).
 */
export async function fetchNotifications(
  opts: { referenceType?: string; limit?: number } = {},
): Promise<NotificationItem[]> {
  const { referenceType, limit = 5 } = opts;
  const res = await fetch("/api/notifications", { cache: "no-store" });
  if (!res.ok) return [];
  const parsed = await readResponsePayload(res);
  const data = asApiJson(parsed.json);
  const all = (data.notifications as NotificationItem[]) ?? [];

  // Unread first (by recency), then read (by recency).
  return all
    .filter((n) => !referenceType || n.reference_type === referenceType)
    .sort((a, b) => {
      const aUnread = !a.read_at;
      const bUnread = !b.read_at;
      if (aUnread !== bUnread) return aUnread ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, limit);
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const res = await fetch("/api/notifications/count", { cache: "no-store" });
  if (!res.ok) return 0;
  const parsed = await readResponsePayload(res);
  const data = asApiJson(parsed.json);
  return typeof data.count === "number" ? data.count : 0;
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  await fetch("/api/notifications/mark-read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notification_ids: ids }),
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetch("/api/notifications/mark-read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notification_ids: [] }),
  });
}

// ─── Sections ─────────────────────────────────────────────────────────────────

export async function renameSectionName(
  sectionId: number,
  name: string,
): Promise<void> {
  const response = await fetch(`/api/classes/${sectionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  const parsed = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(
      getErrorMessageFromPayload(parsed, "Failed to rename section."),
    );
  }
}
