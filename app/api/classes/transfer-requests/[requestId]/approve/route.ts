import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { dispatchTransferRequestApproved } from "@/lib/notifications";
import { isRpcError, RpcError } from "@/lib/rpc-errors";
// ─── POST /api/classes/transfer-requests/[requestId]/approve ──────────────────
// The RPC validates that the caller is the adviser of the from_section.
// The entire enrollment swap is atomic inside the Postgres function.

const _POST = async function(
  _request: Request,
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


  const { error } = await admin.rpc("approve_transfer_request", {
    p_request_id: requestId,
    p_reviewed_by: user.id,
  });

  if (error) {
    if (isRpcError(error, RpcError.REQUEST_NOT_PENDING))
      return Response.json({ error: "REQUEST_NOT_PENDING" }, { status: 409 });
    if (isRpcError(error, RpcError.ENROLLMENT_NOT_FOUND))
      return Response.json(
        { error: "The student's enrollment could not be found." },
        { status: 422 },
      );
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  void dispatchTransferRequestApproved({ requestId });

  return Response.json({ success: true });
}

export const POST = withErrorHandler(_POST)
