import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";

// ─── GET /api/users/signup-notifications ──────────────────────────────────────
// Returns unread new_signup notifications for the current user.
// Each entry carries notification_id (for mark-read) and reference_id (user uid).

const _GET = async function () {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ notifications: [] });

  const { data, error } = await admin
    .from("notifications")
    .select("notification_id, reference_id")
    .eq("user_id", user.id)
    .eq("type", "new_signup")
    .is("read_at", null);

  if (error) return Response.json({ notifications: [] });

  return Response.json({ notifications: data ?? [] });
};

export const GET = withErrorHandler(_GET);
