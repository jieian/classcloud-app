import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { getActiveContext } from "@/lib/active-context";
import type { ScheduledAnnouncementItem } from "@/lib/services/announcementsService";

type RawScheduled = {
  announcement_id: number;
  title: string;
  body: string;
  published_at: string;
  created_at: string;
  users: { first_name: string; last_name: string } | null;
  announcement_attachments: {
    attachment_id: number;
    storage_path: string;
    file_name: string;
    mime_type: string;
    file_size_bytes: number;
    display_order: number;
  }[];
  announcement_targets: { role_id: number | null }[];
};

// ─── GET /api/announcements/scheduled ─────────────────────────────────────────
// Returns SCHEDULED announcements for the active school year.
// Requires announcements.full_access (checked via permission in ProtectedRoute on the page).
// This route still validates auth to prevent unauthorized direct API calls.

const _GET = async function () {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveContext();
  if (!ctx.sy_id) return Response.json({ announcements: [] });

  const { data: rows, error } = await admin
    .from("announcements")
    .select(
      `
      announcement_id,
      title,
      body,
      published_at,
      created_at,
      users!author_id ( first_name, last_name ),
      announcement_attachments ( attachment_id, storage_path, file_name, mime_type, file_size_bytes, display_order ),
      announcement_targets ( role_id )
    `,
    )
    .eq("sy_id", ctx.sy_id)
    .eq("status", "SCHEDULED")
    .is("deleted_at", null)
    .order("published_at", { ascending: true });

  if (error) return Response.json({ error: "Internal server error." }, { status: 500 });

  const announcements: ScheduledAnnouncementItem[] = (rows ?? [] as unknown as RawScheduled[]).map(
    (row: unknown) => {
      const r = row as RawScheduled;
      return {
        announcement_id: r.announcement_id,
        title: r.title,
        body: r.body,
        published_at: r.published_at,
        created_at: r.created_at,
        author_first_name: r.users?.first_name ?? "",
        author_last_name: r.users?.last_name ?? "",
        attachments: (r.announcement_attachments ?? [])
          .sort((a, b) => a.display_order - b.display_order)
          .map((a) => ({
            attachment_id: a.attachment_id,
            storage_path: a.storage_path,
            file_name: a.file_name,
            mime_type: a.mime_type as "image/png" | "image/jpeg",
            file_size_bytes: a.file_size_bytes,
            display_order: a.display_order,
          })),
        targets: r.announcement_targets ?? [],
      };
    },
  );

  return Response.json({ announcements });
};

export const GET = withErrorHandler(_GET);
