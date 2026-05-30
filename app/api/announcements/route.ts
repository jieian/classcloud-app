import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import type { AnnouncementItem } from "@/lib/services/announcementsService";

type RawUserRole   = { role_id: number };
type RawSchoolYear = { sy_id: number };
type RawTarget     = { role_id: number | null };
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
  announcement_targets: RawTarget[];
};

// ─── GET /api/announcements ───────────────────────────────────────────────────
// Returns PUBLISHED announcements for the active school year, filtered by the
// current user's role targets. Includes attachments and read status.

const _GET = async function () {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Parallel: user role IDs + active school year
  const [{ data: userRoles }, { data: schoolYear }] = await Promise.all([
    admin.from("user_roles").select("role_id").eq("uid", user.id),
    admin
      .from("school_years")
      .select("sy_id")
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  if (!schoolYear) return Response.json({ announcements: [] });

  const syId = (schoolYear as RawSchoolYear).sy_id;
  const userRoleIds: number[] = (userRoles as RawUserRole[] ?? []).map((r) => r.role_id);

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

  // Filter by targeting: null role_id = "Everyone", otherwise match user role
  const allRows = (rows ?? []) as unknown as RawAnnouncement[];
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
