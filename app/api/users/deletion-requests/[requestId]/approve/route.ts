import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { eraseUserAccount } from "@/lib/services/userErasure";
import { insertAuditLog } from "@/lib/audit";

// Approve a deletion request → permanent erasure (via the shared eraseUserAccount).
// Atomic claim into APPROVING (with a 5-minute stale-lock reclaim) so concurrent/duplicate
// clicks can't double-erase; idempotent on retry.
const _POST = async function (
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("users.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { requestId } = await params;

  const { data: req } = await admin
    .from("account_deletion_requests")
    .select("uid, status")
    .eq("request_id", requestId)
    .maybeSingle();
  if (!req) return Response.json({ error: "Request not found." }, { status: 404 });

  // Self-decision guard — a different admin must act on your own request.
  if ((req.uid as string) === user.id) {
    return Response.json(
      { error: "You cannot approve your own deletion request." },
      { status: 403 },
    );
  }

  const targetUid = req.uid as string;
  const nowIso = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // Atomic claim: PENDING, or a stale (>5 min) APPROVING lock left by a crashed attempt.
  const { data: claimed } = await admin
    .from("account_deletion_requests")
    .update({ status: "APPROVING", decided_by: user.id, decided_at: nowIso })
    .eq("request_id", requestId)
    .or(`status.eq.PENDING,and(status.eq.APPROVING,decided_at.lt.${staleBefore})`)
    .select("request_id");

  if (!claimed || claimed.length === 0) {
    // Lost the claim — resolve idempotently from the current status.
    const { data: cur } = await admin
      .from("account_deletion_requests")
      .select("status")
      .eq("request_id", requestId)
      .maybeSingle();
    const status = cur?.status as string | undefined;
    if (status === "APPROVED") return Response.json({ success: true });
    if (status === "APPROVING") {
      return Response.json({ error: "This request is being processed." }, { status: 409 });
    }
    return Response.json({ error: "This request is no longer pending." }, { status: 409 });
  }

  // Claim won → erase. eraseUserAccount reconciles the row to APPROVED (keeping decided_by).
  const result = await eraseUserAccount(targetUid, user.id, { notify: "request_approved" });

  if (!result.ok) {
    // Revert the lock so it's immediately retryable; surface the failure to the admin.
    await admin
      .from("account_deletion_requests")
      .update({ status: "PENDING", decided_by: null, decided_at: null })
      .eq("request_id", requestId)
      .eq("status", "APPROVING");
    console.error("[deletion-request approve] erase failed:", result.error);
    return Response.json(
      { error: "Failed to complete the deletion. Please try again." },
      { status: 500 },
    );
  }

  insertAuditLog({
    actor_id: user.id,
    action: "deletion_request_approved",
    entity_type: "user",
    entity_id: targetUid,
    metadata: { request_id: requestId },
  }).catch(() => {});

  return Response.json({ success: true });
};

export const POST = withErrorHandler(_POST);
