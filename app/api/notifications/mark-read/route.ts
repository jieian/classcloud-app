import { getServerUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { parseBody, MarkNotificationsReadSchema } from "@/lib/api-schemas";

// ─── POST /api/notifications/mark-read ────────────────────────────────────────
// Body: { notification_ids: string[] }
// Empty array = mark ALL of the user's unread notifications as read.

const _POST = async function (request: Request) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseBody(MarkNotificationsReadSchema, await request.json().catch(() => ({})));
  if (!parsed.success) return parsed.response;
  const ids = parsed.data.notification_ids;

  const now = new Date().toISOString();

  let query = admin
    .from("notifications")
    .update({ read_at: now })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (ids.length > 0) {
    query = query.in("notification_id", ids);
  }

  const { error } = await query;
  if (error)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  return Response.json({ success: true });
};

export const POST = withErrorHandler(_POST);
