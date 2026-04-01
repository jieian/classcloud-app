import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";

// ─── GET /api/notifications ───────────────────────────────────────────────────
// Returns the last 30 notifications for the current authenticated user.

const _GET = async function () {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await admin
    .from("notifications")
    .select(
      "notification_id, type, title, body, reference_id, reference_type, action_url, read_at, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  return Response.json({ notifications: data ?? [] });
};

export const GET = withErrorHandler(_GET);
