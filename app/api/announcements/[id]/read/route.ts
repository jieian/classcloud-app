import { getServerUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";

// ─── POST /api/announcements/[id]/read ────────────────────────────────────────
// Marks an announcement as read for the current user (upsert).

const _POST = async function (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const announcementId = Number(id);
  if (!Number.isInteger(announcementId) || announcementId <= 0)
    return Response.json({ error: "Invalid ID." }, { status: 400 });

  const { error } = await admin.from("announcement_reads").upsert(
    {
      announcement_id: announcementId,
      user_id: user.id,
      read_at: new Date().toISOString(),
    },
    { onConflict: "announcement_id,user_id" },
  );

  if (error)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  return Response.json({ success: true });
};

export const POST = withErrorHandler(_POST);
