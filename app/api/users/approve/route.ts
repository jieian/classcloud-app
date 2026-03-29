import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendApprovalEmail } from "@/lib/email/templates";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();
  const { uid, first_name, middle_name, last_name, role_ids } = body;

  if (!uid || !first_name?.trim() || !last_name?.trim()) {
    return Response.json({ error: "Missing required fields." }, { status: 400 });
  }

  if (!Array.isArray(role_ids) || role_ids.length === 0) {
    return Response.json({ error: "At least one role is required." }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Activate the user atomically (sets active_status = 1, updates names, replaces roles)
  const { data: result, error: rpcError } = await adminClient.rpc("activate_user_atomic", {
    p_uid: uid,
    p_first_name: first_name.trim(),
    p_middle_name: middle_name?.trim() ?? "",
    p_last_name: last_name.trim(),
    p_role_ids: role_ids,
  });

  if (rpcError) {
    console.error("activate_user_atomic failed:", rpcError.message);
    if (rpcError.message.includes("not found")) {
      return Response.json({ error: "User not found. Please refresh." }, { status: 404 });
    }
    if (rpcError.message.includes("already active")) {
      return Response.json({ error: "User is already active." }, { status: 409 });
    }
    return Response.json({ error: "Failed to activate user. Please try again." }, { status: 500 });
  }

  if (!result?.success) {
    return Response.json({ error: "Activation did not complete successfully." }, { status: 500 });
  }

  // Unban auth user — no-op for new users, lifts ban for restored (soft-deleted) users
  const { data: authData, error: unbanError } = await adminClient.auth.admin.updateUserById(uid, {
    ban_duration: "none",
  });

  if (unbanError) {
    console.error("Failed to unban auth user:", unbanError.message);
    return Response.json(
      { error: "User activated but failed to unban auth account. Please contact support." },
      { status: 500 },
    );
  }

  // Send approval email (non-fatal — account is already active)
  const email = authData.user?.email;
  if (email) {
    sendApprovalEmail({ to: email, firstName: first_name.trim() }).catch((err) =>
      console.error("Failed to send approval email:", err),
    );
  }

  return Response.json({ success: true });
}
