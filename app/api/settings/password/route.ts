import { getServerUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLog } from "@/lib/audit";

const PASSWORD_REQUIREMENTS = [
  (p: string) => p.length >= 8,
  (p: string) => /[0-9]/.test(p),
  (p: string) => /[a-z]/.test(p),
  (p: string) => /[A-Z]/.test(p),
  (p: string) => /[$&+,:;=?@#|'<>.^*()%!-]/.test(p),
];

const _PATCH = async function (request: Request) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { oldPassword, newPassword, confirmPassword } = await request.json() as {
    oldPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  };

  if (!oldPassword || !newPassword || !confirmPassword)
    return Response.json({ error: "All fields are required." }, { status: 400 });

  if (newPassword !== confirmPassword)
    return Response.json({ error: "Passwords do not match." }, { status: 400 });

  if (!PASSWORD_REQUIREMENTS.every((t) => t(newPassword)))
    return Response.json(
      { error: "Password does not meet strength requirements." },
      { status: 400 },
    );

  // Verify old password using an anon client to avoid cookie side-effects
  const verifyClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { error: signInError } = await verifyClient.auth.signInWithPassword({
    email: user.email!,
    password: oldPassword,
  });
  if (signInError)
    return Response.json({ error: "Old password is incorrect." }, { status: 400 });

  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    user.id,
    { password: newPassword },
  );
  if (updateError) {
    console.error("Failed to update password:", updateError.message);
    return Response.json({ error: "Failed to update password. Please try again." }, { status: 500 });
  }

  insertAuditLog({
    actor_id: user.id,
    action: "password_changed",
    entity_type: "user",
    entity_id: user.id,
  }).catch(() => {});

  return Response.json({ success: true });
};

export const PATCH = withErrorHandler(_PATCH);
