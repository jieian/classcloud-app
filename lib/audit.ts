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

// Extend this union as new auditable actions are added throughout the app.
export type AuditAction =
  | "login"
  | "logout"
  | "password_reset"
  | "user_approved"
  | "user_rejected"
  | "user_invited"
  | "user_invite_cancelled"
  | "user_invite_resent"
  | "user_invite_edited"
  | "user_activated_invite"
  | "forced_password_changed"
  | "user_edited"
  | "user_deleted"
  // ── Security events ──────────────────────────────────────────────────────
  | "rate_limit_exceeded"
  | "honeypot_triggered"
  | "turnstile_failed";

type AuditEntry = {
  actor_id: string | null;
  category: AuditCategory;
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  entity_label?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

export async function insertAuditLog(entry: AuditEntry): Promise<void> {
  const { error } = await adminClient.from("audit_logs").insert(entry);
  if (error) console.error("[audit] insert failed:", error.message);
}
