import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis";
import { REDIS_KEYS } from "@/lib/cache-keys";
import { getActiveContext } from "@/lib/active-context";
import { after } from "next/server";
import { insertAuditLog } from "@/lib/audit";

// ─── POST /api/announcements/[id]/publish ─────────────────────────────────────
// Immediately publishes a SCHEDULED announcement.

const _POST = async function (
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!getPermissionsFromUser(user).includes("announcements.full_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const announcementId = parseInt(id, 10);
  if (isNaN(announcementId))
    return Response.json({ error: "Invalid announcement ID." }, { status: 400 });

  const { error } = await admin.rpc("publish_announcement", {
    p_announcement_id: announcementId,
  });

  if (error) {
    if (error.message?.includes("not found or not in SCHEDULED status"))
      return Response.json({ error: "Announcement not found." }, { status: 404 });
    return Response.json({ error: "Failed to publish announcement." }, { status: 500 });
  }

  const ctx = await getActiveContext();
  if (ctx.sy_id) await redis.del(REDIS_KEYS.announcements(ctx.sy_id));

  after(() =>
    insertAuditLog({
      actor_id: user.id,
      action: "announcement_published",
      entity_type: "announcement",
      entity_id: String(announcementId),
    }).catch(() => {}),
  );

  return Response.json({ success: true });
};

export const POST = withErrorHandler(_POST);
