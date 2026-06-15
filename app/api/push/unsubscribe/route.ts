import { getServerUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { parseBody, PushUnsubscribeSchema } from "@/lib/api-schemas";

// ─── POST /api/push/unsubscribe ───────────────────────────────────────────────
// Body: { endpoint } — removes this device's subscription for the authenticated
// user. Scoped to the owner so a user can only delete their own row.

const _POST = async function (request: Request) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseBody(PushUnsubscribeSchema, await request.json().catch(() => ({})));
  if (!parsed.success) return parsed.response;

  const { error } = await admin
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", parsed.data.endpoint)
    .eq("user_id", user.id);
  if (error)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  return Response.json({ success: true });
};

export const POST = withErrorHandler(_POST);
