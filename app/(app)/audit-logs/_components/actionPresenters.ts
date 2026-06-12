import type { AuditLogRow } from "@/lib/services/auditLogsService";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FieldSource = "new" | "old" | "meta";

export type FieldDef = {
  key: string;
  label: string;
  source?: FieldSource;
  format?: (v: unknown) => string;
  omitIfNull?: boolean;
  getValue?: (log: AuditLogRow) => unknown;
};

export type ActionPresenter = {
  getSummary: (log: AuditLogRow) => string;
  fields?: FieldDef[];
  diffFields?: FieldDef[];
};

// ── Value formatters ──────────────────────────────────────────────────────────

const fmtBool = (v: unknown) => (v ? "Yes" : "No");

const fmtStatus = (v: unknown) =>
  ({ PUBLISHED: "Published", SCHEDULED: "Scheduled" })[v as string] ?? String(v);

const fmtEnrollAction = (v: unknown) =>
  ({
    new: "New registration",
    enroll: "Enrolled",
    update_enroll: "Enrollment updated",
    restore_enroll: "Re-enrolled",
    restore_update_enroll: "Re-enrolled (info updated)",
  })[v as string] ?? String(v);

const fmtAudience = (v: unknown) =>
  v === "everyone" ? "Everyone" : "Selected roles";

const fmtSectionType = (v: unknown) =>
  v === "SSES" ? "SSES" : "Regular";

const fmtReason = (v: unknown) =>
  v === "replaced"
    ? "Replaced by new assignment"
    : v === "MANUAL"
    ? "Manually cancelled"
    : String(v);

const fmtLimitType = (v: unknown) =>
  v === "email"
    ? "Email rate limit"
    : v === "ip"
    ? "IP rate limit"
    : String(v);

const fmtRoleIds = (v: unknown) =>
  Array.isArray(v) ? `${v.length} role(s)` : String(v);

const fmtPermissions = (v: unknown) =>
  Array.isArray(v) ? `${v.length} permission(s)` : String(v);

const fmtNullable = (v: unknown) =>
  v === null || v === undefined || v === "" ? "(none)" : String(v);

const fmtRegType = (v: unknown) =>
  v === "new" ? "New account" : v === "restore" ? "Account restored" : String(v);

// ── Helper ────────────────────────────────────────────────────────────────────

function name(log: AuditLogRow): string {
  return log.entity_label ?? log.entity_id;
}

// ── Presenter map (keyed by stored action label) ──────────────────────────────

const PRESENTERS: Record<string, ActionPresenter> = {
  // ── ACCESS ──────────────────────────────────────────────────────────────────
  "Logged In": {
    getSummary: (log) => `${log.actor_name ?? "A user"} signed in`,
  },
  "Logged Out": {
    getSummary: (log) => `${log.actor_name ?? "A user"} signed out`,
  },
  "Registration Confirmed": {
    getSummary: () => "Account registration completed",
    fields: [
      { key: "email", label: "Email" },
      { key: "type", label: "Type", format: fmtRegType },
    ],
  },

  // ── SECURITY ─────────────────────────────────────────────────────────────────
  "Password Reset": {
    getSummary: () => "Password reset was initiated",
  },
  "Password Changed": {
    getSummary: () => "Password was changed",
  },
  "Password Changed (Required)": {
    getSummary: () => "Password changed (administrator-required)",
  },
  "Rate Limit Exceeded": {
    getSummary: (log) => `Rate limit hit on ${name(log)}`,
    fields: [
      { key: "endpoint", label: "Endpoint", source: "meta" },
      { key: "limit_type", label: "Type", source: "meta", format: fmtLimitType },
      { key: "email", label: "Email", source: "meta", omitIfNull: true },
    ],
  },
  "Honeypot Triggered": {
    getSummary: () => "Suspicious form submission detected",
    fields: [
      { key: "endpoint", label: "Endpoint", source: "meta" },
    ],
  },
  "Security Check Failed": {
    getSummary: () => "Bot/CAPTCHA verification failed",
    fields: [
      { key: "endpoint", label: "Endpoint", source: "meta" },
    ],
  },

  // ── ADMIN · Users ────────────────────────────────────────────────────────────
  "User Approved": {
    getSummary: (log) => `${name(log)} was approved`,
  },
  "User Rejected": {
    getSummary: (log) => `${name(log)}'s registration was rejected`,
    fields: [
      { key: "reason", label: "Reason", source: "meta" },
    ],
  },
  "User Invited": {
    getSummary: (log) => `${name(log)} was invited`,
    fields: [
      { key: "email", label: "Email" },
      { key: "role_ids", label: "Roles", format: fmtRoleIds },
    ],
  },
  "Invitation Cancelled": {
    getSummary: (log) => `Invitation cancelled for ${name(log)}`,
    fields: [
      { key: "email", label: "Email", source: "meta" },
    ],
  },
  "Invitation Resent": {
    getSummary: (log) => `Invitation resent to ${name(log)}`,
  },
  "Invitation Edited": {
    getSummary: (log) => `Invitation details updated for ${name(log)}`,
    diffFields: [
      { key: "first_name", label: "First Name" },
      { key: "last_name", label: "Last Name" },
      { key: "email", label: "Email" },
    ],
  },
  "Invitation Activated": {
    getSummary: (log) =>
      `${name(log)} accepted the invitation and activated their account`,
  },
  "User Edited": {
    getSummary: (log) => `${name(log)}'s account was updated`,
    diffFields: [
      { key: "first_name", label: "First Name" },
      { key: "middle_name", label: "Middle Name" },
      { key: "last_name", label: "Last Name" },
      { key: "role_ids", label: "Roles", format: fmtRoleIds },
    ],
  },
  "User Deleted": {
    getSummary: (log) => `${name(log)}'s account was deleted`,
  },
  "Profile Updated": {
    getSummary: () => "Profile was updated",
    diffFields: [
      { key: "first_name", label: "First Name" },
      { key: "middle_name", label: "Middle Name" },
      { key: "last_name", label: "Last Name" },
    ],
  },

  // ── ADMIN · Roles ─────────────────────────────────────────────────────────────
  "Role Created": {
    getSummary: (log) => `Role "${name(log)}" was created`,
    fields: [
      { key: "name", label: "Name" },
      { key: "is_faculty", label: "Faculty role", format: fmtBool },
      { key: "is_self_registerable", label: "Self-registerable", format: fmtBool },
      { key: "permissions", label: "Permissions", format: fmtPermissions },
    ],
  },
  "Role Updated": {
    getSummary: (log) => `Role "${name(log)}" was updated`,
    diffFields: [
      { key: "name", label: "Name" },
      { key: "is_faculty", label: "Faculty role", format: fmtBool },
      { key: "is_self_registerable", label: "Self-registerable", format: fmtBool },
      { key: "permissions", label: "Permissions", format: fmtPermissions },
    ],
  },
  "Role Deleted": {
    getSummary: (log) => `Role "${name(log)}" was deleted`,
    fields: [
      { key: "affected_user_count", label: "Users affected", source: "meta" },
    ],
  },

  // ── ADMIN · Announcements ─────────────────────────────────────────────────────
  "Announcement Created": {
    getSummary: (log) => `Announcement "${name(log)}" was created`,
    fields: [
      { key: "title", label: "Title" },
      { key: "status", label: "Status", format: fmtStatus },
      { key: "audience", label: "Audience", format: fmtAudience },
      { key: "attachment_count", label: "Attachments" },
    ],
  },
  "Announcement Updated": {
    getSummary: (log) => `Announcement "${name(log)}" was updated`,
    fields: [
      { key: "title", label: "Title" },
      { key: "audience", label: "Audience", format: fmtAudience },
      { key: "status", label: "Status", format: fmtStatus },
    ],
  },
  "Announcement Deleted": {
    getSummary: () => "An announcement was deleted",
    fields: [
      { key: "status", label: "Previous status", format: fmtStatus },
      { key: "attachment_count", label: "Attachments removed", source: "meta" },
    ],
  },
  "Announcement Pin Toggled": {
    getSummary: (log) => {
      const pinned = (log.new_values as Record<string, unknown> | null)?.is_pinned;
      return pinned ? "Announcement was pinned" : "Announcement was unpinned";
    },
  },
  "Announcement Published": {
    getSummary: () => "A scheduled announcement was published",
  },

  // ── ACADEMIC · Faculty Load ───────────────────────────────────────────────────
  "Academic Load Assigned": {
    // Detail is rendered by the dedicated AcademicLoadSection in the drawer
    // (reads new_values.changes — the real deltas from the RPC envelope), so no
    // `fields` here. The summary reflects whether anything actually changed.
    getSummary: (log) => {
      const changes = (log.new_values as Record<string, unknown> | null)?.changes;
      const n = Array.isArray(changes) ? changes.length : 0;
      if (Array.isArray(changes) && n === 0) {
        return `No changes were made to ${name(log)}'s academic load`;
      }
      return `${name(log)}'s academic load was updated`;
    },
  },
  "Academic Load Removed": {
    getSummary: (log) => `${name(log)}'s academic load was cleared`,
  },
  "Advisory Class Assigned": {
    getSummary: (log) => `${name(log)} was assigned an advisory class`,
  },
  "Advisory Class Removed": {
    getSummary: (log) => `${name(log)}'s advisory class was removed`,
  },
  "Subject Coordinator Assigned": {
    getSummary: (log) => `${name(log)} was assigned as subject coordinator`,
  },
  "Subject Coordinator Removed": {
    getSummary: (log) => `${name(log)} was displaced as subject coordinator`,
    fields: [
      { key: "reason", label: "Reason", format: fmtReason },
    ],
  },
  "Grade Subject Leader Assigned": {
    getSummary: (log) => `${name(log)} was assigned as grade subject leader`,
  },
  "Grade Subject Leader Removed": {
    getSummary: (log) => `${name(log)} was displaced as grade subject leader`,
    fields: [
      { key: "reason", label: "Reason", format: fmtReason },
    ],
  },
  "Subject Teachers Assigned": {
    // Detail is rendered by the dedicated SubjectTeachersSection in the drawer
    // (reads new_values.changes — per-subject teacher deltas from the RPC
    // envelope), so no `fields` here. The summary reflects whether anything
    // actually changed.
    getSummary: (log) => {
      const changes = (log.new_values as Record<string, unknown> | null)?.changes;
      const n = Array.isArray(changes) ? changes.length : 0;
      if (Array.isArray(changes) && n === 0) {
        return `No subject teacher assignments changed for ${name(log)}`;
      }
      return `Subject teacher assignments were updated for ${name(log)}`;
    },
  },

  // ── ACADEMIC · Classes & Students ─────────────────────────────────────────────
  "Class Created": {
    getSummary: (log) => `Class "${name(log)}" was created`,
    fields: [
      { key: "name", label: "Name" },
      { key: "section_type", label: "Type", format: fmtSectionType },
    ],
  },
  "Class Renamed": {
    getSummary: () => "Class was renamed",
    diffFields: [
      { key: "name", label: "Name" },
    ],
  },
  "Class Adviser Assigned": {
    getSummary: (log) => `Adviser assigned to ${name(log)}`,
    diffFields: [
      { key: "adviser", label: "Adviser", format: fmtNullable },
    ],
  },
  "Class Adviser Removed": {
    getSummary: (log) => `Adviser removed from ${name(log)}`,
    diffFields: [
      { key: "adviser", label: "Adviser", format: fmtNullable },
    ],
  },
  "Student Enrolled": {
    getSummary: (log) => {
      const nv = log.new_values as Record<string, unknown> | null;
      const action = fmtEnrollAction(nv?.enroll_action);
      const lrn = nv?.lrn ?? log.entity_id;
      return `${action} — LRN ${lrn}`;
    },
    fields: [
      { key: "lrn", label: "LRN" },
      { key: "enroll_action", label: "Action", format: fmtEnrollAction },
    ],
  },
  "Student Moved": {
    getSummary: (log) => `${name(log)} was moved to a different section`,
  },
  "Students Imported": {
    getSummary: (log) => {
      const nv = log.new_values as Record<string, unknown> | null;
      const count = nv?.imported_count ?? "?";
      return `${count} student(s) imported into section ${log.entity_id}`;
    },
    fields: [
      { key: "imported_count", label: "Total imported" },
      {
        key: "by_action",
        label: "New registrations",
        format: (v) => String((v as Record<string, number> | null)?.new ?? 0),
        omitIfNull: true,
      },
      {
        key: "by_action",
        label: "Enrolled",
        format: (v) => String((v as Record<string, number> | null)?.enroll ?? 0),
        omitIfNull: true,
      },
      {
        key: "by_action",
        label: "Re-enrolled",
        format: (v) => String((v as Record<string, number> | null)?.restore_enroll ?? 0),
        omitIfNull: true,
      },
      {
        key: "by_action",
        label: "Transferred",
        format: (v) => String((v as Record<string, number> | null)?.move ?? 0),
        omitIfNull: true,
      },
    ],
  },
  "Student Updated": {
    getSummary: (log) => `${name(log)}'s information was updated`,
  },
  "Student Deleted": {
    getSummary: (log) => `${name(log)}'s record was deleted`,
  },

  // ── ACADEMIC · Transfers ──────────────────────────────────────────────────────
  "Transfer Requested": {
    getSummary: (log) => `Transfer requested for ${name(log)}`,
    fields: [
      { key: "student", label: "Student", omitIfNull: true },
      { key: "from_section", label: "From" },
      { key: "to_section", label: "To" },
    ],
  },
  "Transfer Approved": {
    getSummary: (log) => `Transfer approved for ${name(log)}`,
    fields: [
      { key: "student", label: "Student", omitIfNull: true },
      { key: "from_section", label: "From" },
      { key: "to_section", label: "To" },
    ],
  },
  "Transfer Rejected": {
    getSummary: () => "Transfer request was rejected",
    fields: [
      { key: "notes", label: "Notes", source: "meta", omitIfNull: true },
    ],
  },
  "Transfer Cancelled": {
    getSummary: () => "Transfer request was cancelled",
    fields: [
      { key: "reason", label: "Reason", source: "meta", format: fmtReason },
    ],
  },

  // ── ACADEMIC · Curriculum / Exams / School Year ───────────────────────────────
  "Curriculum Created": {
    getSummary: (log) => `Curriculum "${name(log)}" was created`,
    fields: [
      { key: "name", label: "Name" },
      { key: "subject_count", label: "Subjects", omitIfNull: true },
      { key: "group_count", label: "Groups", omitIfNull: true },
    ],
  },
  "Curriculum Updated": {
    getSummary: (log) => `Curriculum "${name(log)}" was updated`,
  },
  "Curriculum Deleted": {
    getSummary: (log) => `Curriculum "${name(log)}" was deleted`,
  },
  "Exam Created": {
    getSummary: (log) => `Exam(s) created for ${name(log)}`,
    fields: [
      { key: "subject", label: "Subject" },
      { key: "quarter", label: "Quarter" },
      { key: "total_items", label: "Items per exam" },
      { key: "exam_count", label: "Exams created" },
    ],
  },
  "Exam Deleted": {
    getSummary: (log) => `Exam "${name(log)}" was deleted`,
    fields: [
      { key: "subject", label: "Subject" },
    ],
  },
  "Exam Score Deleted": {
    getSummary: () => "An exam score was deleted",
  },
  "Exam Reports Finalized": {
    getSummary: () => "Exam reports finalized",
    fields: [
      { key: "reports_saved", label: "Reports saved", format: fmtBool, omitIfNull: true },
      { key: "item_analysis_saved", label: "Item analysis saved", format: fmtBool, omitIfNull: true },
    ],
  },
  "School Year Created": {
    getSummary: (log) => `School Year ${name(log)} was created`,
    fields: [
      {
        key: "start_year",
        label: "Years",
        getValue: (log) => {
          const nv = log.new_values as Record<string, unknown> | null;
          return nv ? `${nv.start_year}–${nv.end_year}` : null;
        },
      },
      { key: "num_quarters", label: "Quarters" },
    ],
  },
  "School Year Deleted": {
    getSummary: (log) => `School Year ${name(log)} was deleted`,
  },
  "Active Quarter Changed": {
    getSummary: (log) => `Active quarter changed for ${name(log)}`,
  },
  "Teaching Load Masterlist Saved": {
    getSummary: (log) => `Teaching load masterlist saved for ${name(log)}`,
  },
};

export default PRESENTERS;
