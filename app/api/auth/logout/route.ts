import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { getServerUser } from "@/lib/supabase/server";
import { insertAuditLog } from "@/lib/audit";

const _POST = async function () {
  const user = await getServerUser();

  if (!user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  await insertAuditLog({
    actor_id: user.id,
    category: "ACCESS",
    action: "logout",
    entity_type: "user",
    entity_id: user.id,
  });

  await adminClient.auth.admin.signOut(user.id);

  return Response.json({ success: true });
};

export const POST = withErrorHandler(_POST);
