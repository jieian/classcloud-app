import { withErrorHandler } from "@/lib/api-error";
import { getServerUser } from "@/lib/supabase/server";
import { insertAuditLog } from "@/lib/audit";

const _POST = async function () {
  const user = await getServerUser();

  // Silent no-op if session isn't readable — this is fire-and-forget from the client.
  if (!user) return Response.json({ ok: true });

  await insertAuditLog({
    actor_id: user.id,
    category: "ACCESS",
    action: "login",
    entity_type: "user",
    entity_id: user.id,
  });

  return Response.json({ ok: true });
};

export const POST = withErrorHandler(_POST);
