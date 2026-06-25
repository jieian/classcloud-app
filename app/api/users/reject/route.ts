import { getServerUser } from "@/lib/supabase/server";
import { sendRejectionEmail } from "@/lib/email/templates";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { insertAuditLog } from "@/lib/audit";
import { redis } from "@/lib/redis";
const _POST = async function(request: Request) {
  const user = await getServerUser();

  if (!user) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();
  const { uid, reason, firstName: clientFirstName } = body;

  if (!uid || typeof uid !== "string") {
    return Response.json({ error: "Invalid user ID." }, { status: 400 });
  }

  if (!reason?.trim()) {
    return Response.json({ error: "A rejection reason is required." }, { status: 400 });
  }


  // Fetch auth user to get email, name, and ban status
  const { data: authData, error: getUserError } = await adminClient.auth.admin.getUserById(uid);

  if (getUserError || !authData.user) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }

  const authUser = authData.user;
  const email = authUser.email;

  const firstName = (typeof clientFirstName === "string" && clientFirstName.trim()) ? clientFirstName.trim() : "Applicant";

  // Prefer the fuller name from the already-loaded auth user over the client-sent
  // first name (no extra read — authUser is already fetched above).
  const authMeta = (authUser.user_metadata ?? {}) as Record<string, unknown>;
  const metaFullName = typeof authMeta.full_name === "string" ? authMeta.full_name.trim() : "";
  const metaFirst = typeof authMeta.first_name === "string" ? authMeta.first_name.trim() : "";
  const metaLast = typeof authMeta.last_name === "string" ? authMeta.last_name.trim() : "";
  const entityLabel = metaFullName || `${metaFirst} ${metaLast}`.trim() || firstName;

  // Rejecting a pending self-registration is always a brand-new, never-approved
  // account — hard delete, which cascades public.users + user_roles. (The old
  // "previously soft-deleted, re-registered while still banned" case is gone:
  // DPA erasure removed restore-by-email, so no pending user is ever banned.)
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(uid);

  if (deleteError) {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  await redis.del("users:pending");

  // Send rejection email (non-fatal)
  if (email) {
    sendRejectionEmail({ to: email, firstName, reason: reason.trim() }).catch((err) =>
      console.error("Failed to send rejection email:", err),
    );
  }

  // Audit log (non-fatal)
  insertAuditLog({
    actor_id: user.id,
    action: "user_rejected",
    entity_type: "user",
    entity_id: uid,
    entity_label: entityLabel,
    metadata: { reason: reason.trim() },
  }).catch(() => {});

  return Response.json({ success: true });
}

export const POST = withErrorHandler(_POST)
