import { adminClient } from "@/lib/supabase/admin";
import { generateRawToken } from "@/lib/crypto";
import { insertAuditLog } from "@/lib/audit";
import {
  sendAccountDeactivationEmail,
  sendDeletionRequestApprovedToRequester,
} from "@/lib/email/templates";
import { syncUserPermissions } from "@/lib/permissions-sync";
import { redis } from "@/lib/redis";
import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { invalidateUserAssignmentsContext } from "@/lib/services/userAssignmentsCache";

/**
 * Permanently erases a user account (RA 10173). The single shared erasure path, called by:
 *   - app/api/users/delete-auth        (direct admin delete; notify: "direct")
 *   - the deletion-request approve route (notify: "request_approved")
 *
 * It serializes on the USER ROW itself (an atomic `deleted_at` claim), so the two entry
 * points can never double-erase the same account — exactly one caller "wins" and owns the
 * notification + the `user_deleted` audit; a concurrent/second caller idempotently completes.
 *
 * TWO LOAD-BEARING ORDERING INVARIANTS (do not reorder):
 *   1. erase_user_atomic runs BEFORE the auth scrub. A failure there leaves auth pristine and
 *      the real email recoverable on retry. Safe because restore-by-email was removed and
 *      check_email_status never returns 'deleted', so the real email living in auth.users
 *      during the DB scrub poses no re-identification risk.
 *   2. notify runs BEFORE reconcile. The gated-notify reads `requester_email` while the request
 *      row is still PENDING/APPROVING; reconcile (the very next step) flips it to APPROVED and
 *      nulls the email. The notify UPDATE's status guard is safe because the row is always
 *      PENDING/APPROVING at notify time (a crashed winner re-enters with it still APPROVING).
 */

type NotifyKind = "direct" | "request_approved";

export type EraseResult =
  | { ok: true; closedRequestId: string | null }
  | { ok: false; error: string };

const tombstoneEmail = (uid: string) => `deleted-${uid}@deleted.invalid`;
const isTombstone = (email: string | null | undefined): boolean =>
  typeof email === "string" && /^deleted-.+@deleted\.invalid$/.test(email);

export async function eraseUserAccount(
  uid: string,
  actorId: string,
  opts?: { notify?: NotifyKind },
): Promise<EraseResult> {
  const notify: NotifyKind = opts?.notify ?? "direct";
  const nowIso = () => new Date().toISOString();

  // ── 1. Atomic cross-path claim: flip deleted_at NULL → now(). One winner. ──────────────
  const { data: claimRows, error: claimError } = await adminClient
    .from("users")
    .update({ deleted_at: nowIso() })
    .eq("uid", uid)
    .is("deleted_at", null)
    .select("first_name");
  if (claimError) return { ok: false, error: claimError.message };

  const won = (claimRows?.length ?? 0) > 0;
  const firstName =
    (claimRows?.[0] as { first_name?: string } | undefined)?.first_name ?? "User";

  // Real email captured BEFORE the auth scrub. On the resume (lost-claim) path, only trust it
  // if auth hasn't been tombstoned yet — otherwise rely on the request row's requester_email.
  let realEmail = "";
  const { data: authBefore } = await adminClient.auth.admin.getUserById(uid);
  const currentEmail = authBefore?.user?.email ?? "";
  if (!isTombstone(currentEmail)) realEmail = currentEmail;

  // ── 2. Public PII scrub + assignment teardown (idempotent). Runs first → a failure here
  //       leaves auth pristine for a clean retry. p_email only feeds pending-registration cleanup.
  const { data: rpcResult, error: rpcError } = await adminClient.rpc("erase_user_atomic", {
    p_uid: uid,
    p_email: realEmail || tombstoneEmail(uid),
  });
  if (rpcError) return { ok: false, error: rpcError.message };
  if (won && (rpcResult as { success?: boolean } | null)?.success === false) {
    return {
      ok: false,
      error: (rpcResult as { message?: string } | null)?.message ?? "User not found",
    };
  }

  // ── 3. Scrub auth.users + auth.identities (skip if already tombstoned). ────────────────
  if (!isTombstone(currentEmail)) {
    const { error: scrubError } = await adminClient.auth.admin.updateUserById(uid, {
      email: tombstoneEmail(uid),
      email_confirm: true,
      password: generateRawToken(),
      user_metadata: {},
      ban_duration: "876000h",
    });
    if (scrubError) return { ok: false, error: scrubError.message };
  }

  // ── 4. Gated notify (exactly-once). Claim the send on the open request row and read its
  //       requester_email (reliable even after the auth tombstone). ──────────────────────
  const { data: notifyRows } = await adminClient
    .from("account_deletion_requests")
    .update({ notified_at: nowIso() })
    .eq("uid", uid)
    .in("status", ["PENDING", "APPROVING"])
    .is("notified_at", null)
    .select("requester_email");
  const notifyRow = notifyRows?.[0] as { requester_email?: string | null } | undefined;

  if (notifyRow) {
    // Request-backed erasure (approve, or a direct delete of a requester) → "approved" email.
    const to = notifyRow.requester_email ?? realEmail;
    if (to) {
      await sendDeletionRequestApprovedToRequester({ to, firstName }).catch((e) =>
        console.error(`[erase] approved email failed (manual follow-up) uid=${uid}:`, e),
      );
    }
  } else if (won && notify === "direct" && realEmail) {
    // Pure direct delete with no request row → the existing deactivation notice.
    await sendAccountDeactivationEmail({ to: realEmail, firstName }).catch((e) =>
      console.error(`[erase] deactivation email failed uid=${uid}:`, e),
    );
  }

  // ── 5. Reconcile any open request → APPROVED, null the email (after notify read it). ──
  // 5a: stamp decider/marker only when not already claimed by an admin (direct-delete case);
  //     the `.is("decided_by", null)` guard preserves an approving admin's decided_by.
  await adminClient
    .from("account_deletion_requests")
    .update({
      decided_by: actorId,
      decided_at: nowIso(),
      internal_note: "Resolved via direct account deletion",
    })
    .eq("uid", uid)
    .in("status", ["PENDING", "APPROVING"])
    .is("decided_by", null);
  // 5b: flip to APPROVED + scrub the email from the durable row (status guard prevents stomp).
  const { data: reconciled } = await adminClient
    .from("account_deletion_requests")
    .update({ status: "APPROVED", requester_email: null })
    .eq("uid", uid)
    .in("status", ["PENDING", "APPROVING"])
    .select("request_id");
  const closedRequestId =
    (reconciled?.[0] as { request_id?: string } | undefined)?.request_id ?? null;

  // ── 6. Invalidate caches + JWT claims; audit (winner only). ───────────────────────────
  await redis.del("users:active", "faculty:list", "faculty:candidates", "faculty:gsl", "coordinator:groups");
  revalidateTag("faculty", "minutes");
  await invalidateUserAssignmentsContext(uid);
  after(() =>
    syncUserPermissions(uid).catch((err) =>
      console.error("syncUserPermissions failed after erase:", err),
    ),
  );

  if (won) {
    // uid only — erasure must not re-introduce the name into the log. Note the closed request.
    insertAuditLog({
      actor_id: actorId,
      action: "user_deleted",
      entity_type: "user",
      entity_id: uid,
      metadata: closedRequestId ? { closed_deletion_request_id: closedRequestId } : undefined,
    }).catch(() => {});
  }

  return { ok: true, closedRequestId };
}
