import {
  createServerSupabaseClient,
  getPermissionsFromUser,
} from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
// ─── GET /api/classes/transfer-requests/count ─────────────────────────────────
// Lightweight endpoint for the NavBar badge.
// Returns the count of PENDING requests the current user must review.

const _GET = async function() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ count: 0 });

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("students.full_access")) return Response.json({ count: 0 });

  const { count, error } = await admin
    .from("section_transfer_requests")
    .select("request_id", { count: "exact", head: true })
    .eq("status", "PENDING");

  if (error) return Response.json({ count: 0 });

  return Response.json({ count: count ?? 0 });
}

export const GET = withErrorHandler(_GET)
