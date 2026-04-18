import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { getServerUser } from "@/lib/supabase/server";
import { insertAuditLog } from "@/lib/audit";

const _POST = async function (request: Request) {
  const user = await getServerUser();

  if (!user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { password } = await request.json();

  if (!password || typeof password !== "string") {
    return Response.json({ error: "Invalid password." }, { status: 400 });
  }

  const { error } = await adminClient.auth.admin.updateUserById(user.id, { password });

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  await insertAuditLog({
    actor_id: user.id,
    category: "SECURITY",
    action: "password_reset",
    entity_type: "user",
    entity_id: user.id,
  });

  return Response.json({ success: true });
};

export const POST = withErrorHandler(_POST);
