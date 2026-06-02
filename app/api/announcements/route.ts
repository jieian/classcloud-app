import { z } from "zod";
import {
  createServerSupabaseClient,
  getPermissionsFromUser,
} from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis";
import { REDIS_KEYS } from "@/lib/cache-keys";
import { getActiveContext } from "@/lib/active-context";
import type { AnnouncementItem } from "@/lib/services/announcementsService";

const AttachmentSchema = z.object({
  storage_path: z.string().min(1),
  file_name: z.string().min(1),
  mime_type: z.enum(["image/png", "image/jpeg"]),
  file_size_bytes: z.number().int().positive(),
  display_order: z.number().int().positive(),
});

const CreateAnnouncementSchema = z.object({
  title: z.string().trim().min(3).max(50),
  body: z.string().trim().min(5).max(2000),
  status: z.enum(["PUBLISHED", "SCHEDULED"]),
  published_at: z.string().datetime({ offset: true }),
  everyone: z.boolean(),
  roleIds: z.array(z.number().int().positive()),
  attachments: z.array(AttachmentSchema).max(3),
});

type RawUserRole   = { role_id: number };
type RawAttachment = { attachment_id: number; storage_path: string; file_name: string; mime_type: string; display_order: number };
type RawRead       = { announcement_id: number };
type RawAnnouncement = {
  announcement_id: number;
  title: string;
  body: string;
  is_pinned: boolean;
  published_at: string;
  users: { first_name: string; last_name: string } | null;
  announcement_attachments: RawAttachment[];
  announcement_targets: { role_id: number | null }[];
};

const CACHE_TTL = 120;
// Cache invalidation: only pin/unpin (announcements/[id]/pin/route.ts) currently
// calls redis.del(`announcements:${sy_id}`). When create/update/delete routes are
// added for announcements, each must also call redis.del with the same key pattern.

// ─── GET /api/announcements ───────────────────────────────────────────────────
// Returns PUBLISHED announcements for the active school year, filtered by the
// current user's role targets. Includes attachments and read status.

const _GET = async function () {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Use Redis-backed active context — avoids a DB round-trip for school year lookup
  const ctx = await getActiveContext();
  if (!ctx.sy_id) return Response.json({ announcements: [] });
  const syId = ctx.sy_id;

  // Parallel: user role IDs + cached announcements list for this SY
  const CACHE_KEY = `announcements:${syId}`;
  const [{ data: userRoles }, cachedRows] = await Promise.all([
    admin.from("user_roles").select("role_id").eq("uid", user.id),
    redis.get<RawAnnouncement[]>(CACHE_KEY),
  ]);

  const userRoleIds: number[] = (userRoles as RawUserRole[] ?? []).map((r) => r.role_id);

  let allRows: RawAnnouncement[];

  if (cachedRows) {
    allRows = cachedRows;
  } else {
    const { data: rows, error } = await admin
      .from("announcements")
      .select(
        `
        announcement_id,
        title,
        body,
        is_pinned,
        published_at,
        users!author_id ( first_name, last_name ),
        announcement_attachments ( attachment_id, storage_path, file_name, mime_type, display_order ),
        announcement_targets ( role_id )
      `,
      )
      .eq("sy_id", syId)
      .eq("status", "PUBLISHED")
      .is("deleted_at", null)
      .order("is_pinned", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(50);

    if (error)
      return Response.json({ error: "Internal server error." }, { status: 500 });

    allRows = (rows ?? []) as unknown as RawAnnouncement[];
    await redis.set(CACHE_KEY, allRows, { ex: CACHE_TTL });
  }

  // Filter by targeting: null role_id = "Everyone", otherwise match user role
  const visible = allRows.filter((row) => {
    const targets = row.announcement_targets ?? [];
    return (
      targets.some((t) => t.role_id === null) ||
      targets.some((t) => t.role_id !== null && userRoleIds.includes(t.role_id))
    );
  });

  if (visible.length === 0) return Response.json({ announcements: [] });

  // Fetch read status only for visible announcements
  const visibleIds = visible.map((r) => r.announcement_id);
  const { data: reads } = await admin
    .from("announcement_reads")
    .select("announcement_id")
    .eq("user_id", user.id)
    .in("announcement_id", visibleIds);

  const readSet = new Set((reads as RawRead[] ?? []).map((r) => r.announcement_id));

  const announcements: AnnouncementItem[] = visible.map((row) => ({
    announcement_id: row.announcement_id,
    title: row.title,
    body: row.body,
    is_pinned: row.is_pinned,
    published_at: row.published_at,
    author_first_name: row.users?.first_name ?? "",
    author_last_name: row.users?.last_name ?? "",
    is_read: readSet.has(row.announcement_id),
    attachments: (row.announcement_attachments ?? [])
      .sort((a, b) => a.display_order - b.display_order)
      .map((a) => ({
        attachment_id: a.attachment_id,
        storage_path: a.storage_path,
        file_name: a.file_name,
        mime_type: a.mime_type as "image/png" | "image/jpeg",
        display_order: a.display_order,
      })),
  }));

  return Response.json({ announcements });
};

export const GET = withErrorHandler(_GET);

// ─── POST /api/announcements ──────────────────────────────────────────────────
// Creates a new PUBLISHED or SCHEDULED announcement.

const _POST = async function (req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!getPermissionsFromUser(user).includes("announcements.full_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const ctx = await getActiveContext();
  if (!ctx.sy_id)
    return Response.json({ error: "No active school year." }, { status: 422 });

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = CreateAnnouncementSchema.safeParse(rawBody);
  if (!parsed.success)
    return Response.json({ error: "Validation failed.", details: parsed.error.flatten() }, { status: 400 });

  const { title, body: bodyText, status, published_at, everyone, roleIds, attachments } = parsed.data;

  const { data, error } = await admin.rpc("create_announcement", {
    p_title: title,
    p_body: bodyText,
    p_author_id: user.id,
    p_sy_id: ctx.sy_id,
    p_status: status,
    p_published_at: published_at,
    p_everyone: everyone ?? false,
    p_role_ids: roleIds ?? [],
    p_attachments: attachments ?? [],
  });

  if (error)
    return Response.json({ error: "Failed to create announcement." }, { status: 500 });

  if (status === "PUBLISHED")
    await redis.del(REDIS_KEYS.announcements(ctx.sy_id));

  return Response.json({ announcement_id: data });
};

export const POST = withErrorHandler(_POST);
