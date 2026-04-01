import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { dispatchTransferRequestRejected } from "@/lib/notifications";
import { parseBody, RejectTransferRequestSchema } from "@/lib/api-schemas";
import { isRpcError, RpcError } from "@/lib/rpc-errors";
// ─── POST /api/classes/transfer-requests/[requestId]/reject ───────────────────

const _POST = async function(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getUserPermissions(user.id);
  if (!permissions.includes("students.full_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { requestId } = await params;
  if (!requestId)
    return Response.json({ error: "Missing request ID." }, { status: 400 });

  const parsed = parseBody(RejectTransferRequestSchema, await request.json().catch(() => ({})));
  if (!parsed.success) return parsed.response;
  const notes = parsed.data.notes?.trim() || null;


  const { error } = await admin.rpc("reject_transfer_request", {
    p_request_id: requestId,
    p_reviewed_by: user.id,
    p_notes: notes,
  });

  if (error) {
    if (isRpcError(error, RpcError.REQUEST_NOT_PENDING))
      return Response.json({ error: "REQUEST_NOT_PENDING" }, { status: 409 });
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  void dispatchTransferRequestRejected({ requestId, notes });

  return Response.json({ success: true });
}

export const POST = withErrorHandler(_POST)
