import {
  createServerSupabaseClient,
  getPermissionsFromUser,
} from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { insertAuditLog } from "@/lib/audit";
import { sendInviteCancelledEmail } from "@/lib/email/templates";

const _POST = async function (request: Request) {
  // ── Auth + permissions ────────────────────────────────────────────────────
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = getPermissionsFromUser(caller);
  if (!permissions.includes("users.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { uid } = body;

  if (!uid) {
    return Response.json({ error: "Missing uid." }, { status: 400 });
  }

  // Verify invitation exists
  const { data: invitation } = await adminClient
    .from("user_invitations")
    .select("id")
    .eq("uid", uid)
    .single();

  if (!invitation) {
    return Response.json(
      { error: "No pending invitation found for this user." },
      { status: 404 },
    );
  }

  // Fetch user info before deletion (for email + audit)
  const [profileResult, authResult] = await Promise.all([
    adminClient
      .from("users")
      .select("first_name, last_name")
      .eq("uid", uid)
      .single(),
    adminClient.auth.admin.getUserById(uid),
  ]);

  const firstName = profileResult.data?.first_name ?? "";
  const lastName = profileResult.data?.last_name ?? "";
  const email = authResult.data?.user?.email ?? "";

  // Hard-delete invitation record
  await adminClient.from("user_invitations").delete().eq("uid", uid);

  // Delete auth user (ON DELETE CASCADE removes users + user_roles)
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(uid);
  if (deleteError) {
    console.error("Failed to delete auth user on cancel-invite:", deleteError.message);
    return Response.json(
      { error: "Failed to cancel invitation. Please try again." },
      { status: 500 },
    );
  }

  // Audit log (non-fatal)
  insertAuditLog({
    actor_id: caller.id,
    category: "ADMIN",
    action: "user_invite_cancelled",
    entity_type: "user",
    entity_id: uid,
    entity_label: `${firstName} ${lastName}`.trim(),
    metadata: { email },
  }).catch(() => {});

  // Send cancellation email (non-fatal)
  if (email && firstName) {
    sendInviteCancelledEmail({ to: email, firstName }).catch((e) =>
      console.error("Failed to send invite-cancelled email:", e),
    );
  }

  return Response.json({ success: true });
};

export const POST = withErrorHandler(_POST);
