import { createClient } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

// ─── POST /api/classes/transfer-requests/[requestId]/reject ───────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getUserPermissions(user.id);
  const hasStudentAccess =
    permissions.includes("students.full_access") ||
    permissions.includes("students.limited_access");
  if (!hasStudentAccess)
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { requestId } = await params;
  if (!requestId)
    return Response.json({ error: "Missing request ID." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { notes?: string };
  const notes = (body.notes ?? "").trim() || null;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await admin.rpc("reject_transfer_request", {
    p_request_id: requestId,
    p_reviewed_by: user.id,
    p_notes: notes,
  });

  if (error) {
    if (error.message.includes("REQUEST_NOT_PENDING"))
      return Response.json({ error: "REQUEST_NOT_PENDING" }, { status: 409 });
    if (error.message.includes("NOT_AUTHORIZED"))
      return Response.json({ error: "Forbidden" }, { status: 403 });
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
