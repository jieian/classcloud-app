/**
 * Audit log dispatcher.
 *
 * insertAuditLog — awaitable; call directly from server routes where you
 * want to ensure the log is written before responding.
 *
 * Errors are logged to console but never thrown so a failed audit write
 * never blocks the operation that triggered it.
 */

import { adminClient } from "@/lib/supabase/admin";

export type AuditCategory = "ACCESS" | "SECURITY" | "ACADEMIC" | "ADMIN" | "SYSTEM";

// Action registry: stable key → human-readable label + canonical category.
// Call sites pass the key; insertAuditLog stores the registry's label and
// category, so the category can never drift from the action.
export const AUDIT_ACTIONS = {
  // ── ACCESS ────────────────────────────────────────────────────────────────
  // CONTRACT: the ACCESS category covers (1) authentication/session events and
  // (2) access to sensitive personal data (e.g. exporting student PII). Both are
  // retained for 12 months (security-grade retention; see the compliance plan
  // Phase 5b). DO NOT file low-sensitivity events here (e.g. "viewed own profile",
  // routine page views) — they would be over-retained for no purpose; put those
  // in ACADEMIC/ADMIN/SYSTEM.
  login:                          { label: "Logged In",                      category: "ACCESS"   },
  logout:                         { label: "Logged Out",                     category: "ACCESS"   },
  registration_confirmed:         { label: "Registration Confirmed",         category: "ACCESS"   },
  // Sensitive personal-data exports (RA 10173 accountability — read-access trail):
  roster_exported:                { label: "Student Roster Exported",        category: "ACCESS"   },
  exam_report_exported:           { label: "Exam Result Report Exported",    category: "ACCESS"   },
  consolidated_report_exported:   { label: "Consolidated Report Exported",   category: "ACCESS"   },

  // ── SECURITY ──────────────────────────────────────────────────────────────
  password_reset:                 { label: "Password Reset",                 category: "SECURITY" },
  password_changed:               { label: "Password Changed",               category: "SECURITY" }, // NEW (voluntary, settings/password)
  forced_password_changed:        { label: "Password Changed (Required)",    category: "SECURITY" },
  rate_limit_exceeded:            { label: "Rate Limit Exceeded",            category: "SECURITY" },
  honeypot_triggered:             { label: "Honeypot Triggered",             category: "SECURITY" },
  turnstile_failed:               { label: "Security Check Failed",          category: "SECURITY" },

  // ── ADMIN · users ─────────────────────────────────────────────────────────
  user_approved:                  { label: "User Approved",                  category: "ADMIN"    },
  user_rejected:                  { label: "User Rejected",                  category: "ADMIN"    },
  user_invited:                   { label: "User Invited",                   category: "ADMIN"    },
  user_invite_cancelled:          { label: "Invitation Cancelled",           category: "ADMIN"    },
  user_invite_resent:             { label: "Invitation Resent",              category: "ADMIN"    },
  user_invite_edited:             { label: "Invitation Edited",              category: "ADMIN"    },
  user_activated_invite:          { label: "Invitation Activated",           category: "ADMIN"    },
  user_edited:                    { label: "User Edited",                    category: "ADMIN"    },
  user_deleted:                   { label: "User Deleted",                   category: "ADMIN"    },
  profile_updated:                { label: "Profile Updated",                category: "ADMIN"    }, // NEW

  // ── ADMIN · roles ─────────────────────────────────────────────────────────
  role_created:                   { label: "Role Created",                   category: "ADMIN"    },
  role_updated:                   { label: "Role Updated",                   category: "ADMIN"    },
  role_deleted:                   { label: "Role Deleted",                   category: "ADMIN"    },

  // ── ADMIN · announcements ─────────────────────────────────────────────────
  announcement_created:           { label: "Announcement Created",           category: "ADMIN"    }, // NEW
  announcement_updated:           { label: "Announcement Updated",           category: "ADMIN"    }, // NEW
  announcement_deleted:           { label: "Announcement Deleted",           category: "ADMIN"    }, // NEW
  announcement_pin_toggled:       { label: "Announcement Pin Toggled",       category: "ADMIN"    }, // NEW
  announcement_published:         { label: "Announcement Published",         category: "ADMIN"    }, // NEW

  // ── ACADEMIC · faculty load ───────────────────────────────────────────────
  faculty_academic_load_assigned: { label: "Academic Load Assigned",         category: "ACADEMIC" },
  faculty_load_removed:           { label: "Academic Load Removed",          category: "ACADEMIC" },
  advisory_class_assigned:        { label: "Advisory Class Assigned",        category: "ACADEMIC" },
  advisory_class_removed:         { label: "Advisory Class Removed",         category: "ACADEMIC" },
  subject_coordinator_assigned:   { label: "Subject Coordinator Assigned",   category: "ACADEMIC" },
  subject_coordinator_removed:    { label: "Subject Coordinator Removed",    category: "ACADEMIC" },
  grade_subject_leader_assigned:  { label: "Grade Subject Leader Assigned",  category: "ACADEMIC" },
  grade_subject_leader_removed:   { label: "Grade Subject Leader Removed",   category: "ACADEMIC" },
  masterlist_saved:               { label: "Teaching Load Masterlist Saved", category: "ACADEMIC" },

  // ── ACADEMIC · classes & students ─────────────────────────────────────────
  section_created:                { label: "Class Created",                  category: "ACADEMIC" }, // NEW
  section_renamed:                { label: "Class Renamed",                  category: "ACADEMIC" }, // NEW
  section_adviser_assigned:       { label: "Class Adviser Assigned",         category: "ACADEMIC" }, // NEW
  section_adviser_removed:        { label: "Class Adviser Removed",          category: "ACADEMIC" }, // NEW
  subject_teachers_assigned:      { label: "Subject Teachers Assigned",      category: "ACADEMIC" }, // NEW
  student_enrolled:               { label: "Student Enrolled",               category: "ACADEMIC" }, // NEW
  student_moved:                  { label: "Student Moved",                  category: "ACADEMIC" }, // NEW
  students_imported:              { label: "Students Imported",              category: "ACADEMIC" }, // NEW
  student_updated:                { label: "Student Updated",                category: "ACADEMIC" }, // NEW
  student_deleted:                { label: "Student Deleted",                category: "ACADEMIC" }, // NEW

  // ── ACADEMIC · transfers ──────────────────────────────────────────────────
  transfer_requested:             { label: "Transfer Requested",             category: "ACADEMIC" }, // NEW
  transfer_approved:              { label: "Transfer Approved",              category: "ACADEMIC" }, // NEW
  transfer_rejected:              { label: "Transfer Rejected",              category: "ACADEMIC" }, // NEW
  transfer_cancelled:             { label: "Transfer Cancelled",             category: "ACADEMIC" }, // NEW

  // ── ACADEMIC · curriculum / exams / school year ───────────────────────────
  curriculum_created:             { label: "Curriculum Created",             category: "ACADEMIC" }, // NEW
  curriculum_updated:             { label: "Curriculum Updated",             category: "ACADEMIC" }, // NEW
  curriculum_deleted:             { label: "Curriculum Deleted",             category: "ACADEMIC" }, // NEW
  exam_created:                   { label: "Exam Created",                   category: "ACADEMIC" }, // NEW
  exam_deleted:                   { label: "Exam Deleted",                   category: "ACADEMIC" }, // NEW
  exam_score_deleted:             { label: "Exam Score Deleted",             category: "ACADEMIC" }, // NEW
  exam_reports_finalized:         { label: "Exam Reports Finalized",         category: "ACADEMIC" }, // NEW
  school_year_created:            { label: "School Year Created",            category: "ACADEMIC" }, // replaces raw "CREATE"
  school_year_deleted:            { label: "School Year Deleted",            category: "ACADEMIC" }, // NEW
  quarter_toggled:                { label: "Active Quarter Changed",         category: "ACADEMIC" }, // NEW
} as const satisfies Record<string, { label: string; category: AuditCategory }>;

export type AuditActionKey = keyof typeof AUDIT_ACTIONS;

// Caller-supplied fields. `action` is a stable key; the stored label and
// category are derived from AUDIT_ACTIONS — never passed at call sites.
export type AuditLogInput = {
  actor_id: string | null;
  action: AuditActionKey;
  entity_type: string;
  entity_id: string;
  entity_label?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

// Row shape actually written to audit_logs (label + category resolved).
type AuditEntry = Omit<AuditLogInput, "action"> & {
  action: string;
  category: AuditCategory;
};

function toEntry(input: AuditLogInput): AuditEntry {
  const { action, ...rest } = input;
  const { label, category } = AUDIT_ACTIONS[action];
  return { ...rest, action: label, category };
}

export async function insertAuditLog(input: AuditLogInput): Promise<void> {
  const { error } = await adminClient.from("audit_logs").insert(toEntry(input));
  if (error) console.error("[audit] insert failed:", error.message);
}

/** Batched variant — one insert round trip for the rare multi-row case. */
export async function insertAuditLogs(inputs: AuditLogInput[]): Promise<void> {
  if (inputs.length === 0) return;
  const { error } = await adminClient.from("audit_logs").insert(inputs.map(toEntry));
  if (error) console.error("[audit] batch insert failed:", error.message);
}

/**
 * Log straight from an RPC's `_audit` envelope. The route supplies the fields
 * it knows statically (actor, action, entity_type, entity_id); the envelope
 * carries the human-readable label and the old→new diff produced inside the
 * transaction. A null/undefined envelope is a no-op.
 */
export function auditFromRpc(
  base: { actor_id: string | null; action: AuditActionKey; entity_type: string; entity_id: string },
  env:
    | {
        label: string | null;
        old?: Record<string, unknown> | null;
        new?: Record<string, unknown> | null;
        changes?: Array<Record<string, unknown>> | null;
        metadata?: Record<string, unknown> | null;
      }
    | null
    | undefined,
): Promise<void> {
  if (!env) return Promise.resolve();
  return insertAuditLog({
    ...base,
    entity_label: env.label ?? null,
    old_values: env.old ?? null,
    new_values: env.new ?? (env.changes ? { changes: env.changes } : null),
    metadata: env.metadata ?? null,
  });
}
