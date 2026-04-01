import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendRejectionEmail } from "@/lib/email/templates";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
const _POST = async function(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();
  const { uid, reason } = body;

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
  const firstName = authUser.user_metadata?.first_name ?? "Applicant";
  const isBanned = authUser.banned_until && new Date(authUser.banned_until) > new Date();

  if (isBanned) {
    // Restored (previously soft-deleted) user — soft delete: stamp deleted_at + keep banned
    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      "soft_delete_user_atomic",
      { p_uid: uid },
    );

    if (rpcError) {
      return Response.json({ error: "Internal server error." }, { status: 500 });
    }

    if (!rpcResult?.success) {
      return Response.json(
        { error: rpcResult?.message ?? "Failed to soft-delete user." },
        { status: 500 },
      );
    }
  } else {
    // Brand new user — hard delete, cascades public.users + user_roles
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(uid);

    if (deleteError) {
      return Response.json({ error: "Internal server error." }, { status: 500 });
    }
  }

  // Send rejection email (non-fatal)
  if (email) {
    sendRejectionEmail({ to: email, firstName, reason: reason.trim() }).catch((err) =>
      console.error("Failed to send rejection email:", err),
    );
  }

  return Response.json({ success: true });
}

export const POST = withErrorHandler(_POST)
