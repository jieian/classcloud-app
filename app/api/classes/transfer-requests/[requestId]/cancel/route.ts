import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
// ─── POST /api/classes/transfer-requests/[requestId]/cancel ───────────────────
// Allows the original requester to cancel their own PENDING request.

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

  return Response.json({ success: true });
}

export const POST = withErrorHandler(_POST)
