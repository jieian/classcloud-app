import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis";

// ─── POST /api/announcements/[id]/pin ────────────────────────────────────────
// Toggles the pinned state of an announcement (announcements.full_access only).
// At most 3 announcements can be pinned per school year.

const _POST = async function (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!getPermissionsFromUser(user).includes("announcements.full_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const announcementId = Number(id);
  if (!Number.isInteger(announcementId) || announcementId <= 0)
    return Response.json({ error: "Invalid ID." }, { status: 400 });

  const { data: current } = await admin
    .from("announcements")
    .select("is_pinned, sy_id")
    .eq("announcement_id", announcementId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!current) return Response.json({ error: "Not found." }, { status: 404 });

  const { is_pinned, sy_id } = current as { is_pinned: boolean; sy_id: number };

  // Enforce max 3 pinned per school year
  if (!is_pinned) {
    const { count } = await admin
      .from("announcements")
      .select("announcement_id", { count: "exact", head: true })
      .eq("sy_id", sy_id)
      .eq("is_pinned", true)
      .is("deleted_at", null);

    if ((count ?? 0) >= 3)
      return Response.json({ error: "PIN_LIMIT" }, { status: 422 });
  }

  const { error } = await admin
    .from("announcements")
    .update({ is_pinned: !is_pinned })
    .eq("announcement_id", announcementId);

  if (error)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  await redis.del(`announcements:${sy_id}`);
  return Response.json({ is_pinned: !is_pinned });
};

export const POST = withErrorHandler(_POST);
