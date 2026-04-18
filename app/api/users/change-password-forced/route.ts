import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { insertAuditLog } from "@/lib/audit";

const PASSWORD_REQUIREMENTS = [
  (p: string) => p.length >= 8,
  (p: string) => /[0-9]/.test(p),
  (p: string) => /[a-z]/.test(p),
  (p: string) => /[A-Z]/.test(p),
  (p: string) => /[$&+,:;=?@#|'<>.^*()%!-]/.test(p),
];

const _POST = async function (request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { newPassword } = body;

  if (!newPassword) {
    return Response.json({ error: "New password is required." }, { status: 400 });
  }

  if (!PASSWORD_REQUIREMENTS.every((test) => test(newPassword))) {
    return Response.json(
      { error: "Password does not meet the required strength criteria." },
      { status: 400 },
    );
  }

  // Update password in auth
  const { error: authError } = await adminClient.auth.admin.updateUserById(
    user.id,
    { password: newPassword },
  );

  if (authError) {
    console.error("Failed to update password:", authError.message);
    return Response.json(
      { error: "Failed to update password. Please try again." },
      { status: 500 },
    );
  }

  // Clear must_change_password flag
  const { error: profileError } = await adminClient
    .from("users")
    .update({ must_change_password: false })
    .eq("uid", user.id);

  if (profileError) {
    console.error("Failed to clear must_change_password:", profileError.message);
    // Non-fatal — password was changed successfully
  }

  // Audit log (non-fatal)
  insertAuditLog({
    actor_id: user.id,
    category: "SECURITY",
    action: "forced_password_changed",
    entity_type: "user",
    entity_id: user.id,
  }).catch(() => {});

  return Response.json({ success: true });
};

export const POST = withErrorHandler(_POST);
