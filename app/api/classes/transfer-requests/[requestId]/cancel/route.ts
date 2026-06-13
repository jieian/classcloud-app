import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { after } from "next/server";
import { insertAuditLog } from "@/lib/audit";
import { invalidatePendingTransferBadge } from "@/lib/services/badgeCache";
// ─── POST /api/classes/transfer-requests/[requestId]/cancel ───────────────────
// Allows the original requester to cancel their own PENDING request.

const _POST = async function(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("students.limited_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { requestId } = await params;
  if (!requestId)
    return Response.json({ error: "Missing request ID." }, { status: 400 });


  // Only cancel if the request belongs to this user and is still PENDING
  const { data, error } = await admin
    .from("section_transfer_requests")
    .update({
      status: "CANCELLED",
      cancellation_reason: "MANUAL",
      reviewed_at: new Date().toISOString(),
    })
    .eq("request_id", requestId)
    .eq("requested_by", user.id)
    .eq("status", "PENDING")
    .select("request_id");

  if (error) return Response.json({ error: "Internal server error." }, { status: 500 });

  if (!data || data.length === 0)
    return Response.json({ error: "REQUEST_NOT_PENDING" }, { status: 409 });

  // PENDING count went down — refresh reviewers' shared badge (audit #4).
  await invalidatePendingTransferBadge().catch(() => {});

  after(() =>
    insertAuditLog({
      actor_id: user.id,
      action: "transfer_cancelled",
      entity_type: "transfer_request",
      entity_id: requestId,
      metadata: { reason: "MANUAL" },
    }).catch(() => {}),
  );

  return Response.json({ success: true });
}

export const POST = withErrorHandler(_POST)
