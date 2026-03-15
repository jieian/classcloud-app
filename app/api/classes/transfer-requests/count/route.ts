import { createClient } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

// ─── GET /api/classes/transfer-requests/count ─────────────────────────────────
// Lightweight endpoint for the NavBar badge.
// Returns the count of PENDING requests the current user must review.

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ count: 0 });

  const permissions = await getUserPermissions(user.id);
  const hasStudentAccess =
    permissions.includes("students.full_access") ||
    permissions.includes("students.limited_access");
  if (!hasStudentAccess) return Response.json({ count: 0 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: advisedSections } = await admin
    .from("sections")
    .select("section_id")
    .eq("adviser_id", user.id)
    .is("deleted_at", null);

  const advisedIds = ((advisedSections ?? []) as any[]).map(
    (s) => s.section_id as number,
  );

  if (advisedIds.length === 0) return Response.json({ count: 0 });

  const { count, error } = await admin
    .from("section_transfer_requests")
    .select("request_id", { count: "exact", head: true })
    .eq("status", "PENDING")
    .in("from_section_id", advisedIds);

  if (error) return Response.json({ count: 0 });

  return Response.json({ count: count ?? 0 });
}
