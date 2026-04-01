import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
const _POST = async function(request: Request) {
  const body = await request.json();
  const { token, uid } = body;

  if (!token || !uid || typeof token !== "string" || typeof uid !== "string") {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }


  // Fetch the auth user and validate the restore token
  const {
    data: { user },
    error: getUserError,
  } = await adminClient.auth.admin.getUserById(uid);

  if (getUserError || !user) {
    return Response.json({ error: "Invalid or expired link." }, { status: 400 });
  }

  const meta = user.user_metadata ?? {};

  if (!meta.restore_token || meta.restore_token !== token) {
    return Response.json({ error: "Invalid or expired link." }, { status: 400 });
  }

  const { first_name, middle_name, last_name, role_ids } = meta;

  if (!first_name || !last_name) {
    return Response.json(
      { error: "Account data is incomplete. Please sign up again." },
      { status: 400 },
    );
  }

  // Consume the token immediately (single-use)
  await adminClient.auth.admin
    .updateUserById(uid, {
      user_metadata: { ...meta, restore_token: null },
    })
    .catch((err) => console.error("Failed to clear restore token:", err));

  // Restore the users row to pending state (active_status = 0, deleted_at = null)
  // The auth ban stays in place — it is lifted by the admin on approval.
  const { data: restoreResult, error: restoreError } = await adminClient.rpc(
    "restore_user_atomic",
    {
      p_uid: uid,
      p_first_name: first_name,
      p_middle_name: middle_name || "",
      p_last_name: last_name,
      p_role_ids: Array.isArray(role_ids) ? role_ids : [],
    },
  );

  if (restoreError) {
    console.error("restore_user_atomic failed:", restoreError.message);
    return Response.json(
      { error: "Failed to restore account. Please try again." },
      { status: 500 },
    );
  }

  if (restoreResult?.success === false) {
    return Response.json(
      { error: "Failed to restore account." },
      { status: 500 },
    );
  }

  return Response.json({ success: true });
}

export const POST = withErrorHandler(_POST)
