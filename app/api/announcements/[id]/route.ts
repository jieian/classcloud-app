import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis";
import { REDIS_KEYS } from "@/lib/cache-keys";
import { getActiveContext } from "@/lib/active-context";
import { after } from "next/server";
import { insertAuditLog } from "@/lib/audit";
import type { UpdateAnnouncementPayload } from "@/lib/services/announcementsService";

// ─── DELETE /api/announcements/[id] ───────────────────────────────────────────

const _DELETE = async function (
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
    return Response.json({ error: "Invalid announcement ID" }, { status: 400 });

  // Fetch status + attachments in parallel before deletion
  const [{ data: announcement }, { data: attachments }] = await Promise.all([
    admin
      .from("announcements")
      .select("status, sy_id")
      .eq("announcement_id", announcementId)
      .is("deleted_at", null)
      .maybeSingle(),
    admin
      .from("announcement_attachments")
      .select("storage_path")
      .eq("announcement_id", announcementId),
  ]);

  if (!announcement)
    return Response.json({ error: "Announcement not found" }, { status: 404 });

  const { status, sy_id } = announcement as { status: string; sy_id: number };
  const rpcName = status === "PUBLISHED" ? "delete_published_announcement" : "delete_announcement";

  const { error } = await admin.rpc(rpcName, { p_announcement_id: announcementId });

  if (error) {
    if (error.message?.includes("not found or not in")) {
      return Response.json({ error: "Announcement not found" }, { status: 404 });
    }
    return Response.json({ error: "Failed to delete announcement" }, { status: 500 });
  }

  if (attachments && attachments.length > 0) {
    await admin.storage
      .from("announcement-images")
      .remove(attachments.map((a) => a.storage_path));
  }

  if (status === "PUBLISHED")
    await redis.del(REDIS_KEYS.announcements(sy_id));

  after(() =>
    insertAuditLog({
      actor_id: user.id,
      action: "announcement_deleted",
      entity_type: "announcement",
      entity_id: String(announcementId),
      // Title not loaded here (only status, sy_id) — label deferred to RPC _audit.
      new_values: { status },
      metadata: { attachment_count: attachments?.length ?? 0 },
    }).catch(() => {}),
  );

  return Response.json({ success: true });
};

// ─── PATCH /api/announcements/[id] ────────────────────────────────────────────

const _PATCH = async function (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!getPermissionsFromUser(user).includes("announcements.full_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const announcementId = parseInt(id, 10);
  if (isNaN(announcementId))
    return Response.json({ error: "Invalid announcement ID" }, { status: 400 });

  const body = (await req.json()) as UpdateAnnouncementPayload;
  const { title, body: bodyText, published_at, everyone, roleIds, attachments } = body;

  if (!title?.trim() || !bodyText?.trim())
    return Response.json({ error: "Missing required fields" }, { status: 400 });

  const { data: current } = await admin
    .from("announcements")
    .select("status, sy_id")
    .eq("announcement_id", announcementId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!current)
    return Response.json({ error: "Announcement not found" }, { status: 404 });

  const { status, sy_id } = current as { status: string; sy_id: number };

  let rpcError: { message?: string } | null = null;

  if (status === "PUBLISHED") {
    const { error } = await admin.rpc("update_published_announcement", {
      p_announcement_id: announcementId,
      p_title: title.trim(),
      p_body: bodyText.trim(),
      p_everyone: everyone ?? false,
      p_role_ids: roleIds ?? [],
      p_attachments: attachments ?? [],
    });
    rpcError = error;
    if (!error) await redis.del(REDIS_KEYS.announcements(sy_id));
  } else {
    if (!published_at)
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    const { error } = await admin.rpc("update_scheduled_announcement", {
      p_announcement_id: announcementId,
      p_title: title.trim(),
      p_body: bodyText.trim(),
      p_published_at: published_at,
      p_everyone: everyone ?? false,
      p_role_ids: roleIds ?? [],
      p_attachments: attachments ?? [],
    });
    rpcError = error;
  }

  if (rpcError) {
    if (rpcError.message?.includes("not found or not in"))
      return Response.json({ error: "Announcement not found" }, { status: 404 });
    return Response.json({ error: "Failed to update announcement" }, { status: 500 });
  }

  after(() =>
    insertAuditLog({
      actor_id: user.id,
      action: "announcement_updated",
      entity_type: "announcement",
      entity_id: String(announcementId),
      entity_label: title.trim(),
      new_values: { title: title.trim(), audience: everyone ? "everyone" : "roles", status },
    }).catch(() => {}),
  );

  return Response.json({ success: true });
};

export const DELETE = withErrorHandler(_DELETE);
export const PATCH = withErrorHandler(_PATCH);
