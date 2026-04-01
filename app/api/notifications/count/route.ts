import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";

// ─── GET /api/notifications/count ─────────────────────────────────────────────
// Returns the count of unread notifications for the current user.

const _GET = async function () {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ count: 0 });

  const { count, error } = await admin
    .from("notifications")
    .select("notification_id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return Response.json({ count: 0 });

  return Response.json({ count: count ?? 0 });
};

export const GET = withErrorHandler(_GET);
