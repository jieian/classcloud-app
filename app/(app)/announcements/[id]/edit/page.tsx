import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { adminClient as admin } from "@/lib/supabase/admin";
import CreateAnnouncementClient from "../../create/_components/CreateAnnouncementClient";
import type { ScheduledAnnouncementItem } from "@/lib/services/announcementsService";

export const metadata: Metadata = {
  title: "Edit Announcement | ClassCloud",
};

type RawRow = {
  announcement_id: number;
  title: string;
  body: string;
  published_at: string;
  created_at: string;
  status: string;
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

async function fetchAnnouncement(id: number): Promise<{ data: ScheduledAnnouncementItem; status: string } | null> {
  const { data, error } = await admin
    .from("announcements")
    .select(
      `
      announcement_id,
      title,
      body,
      published_at,
      created_at,
      status,
      users!author_id ( first_name, last_name ),
      announcement_attachments ( attachment_id, storage_path, file_name, mime_type, file_size_bytes, display_order ),
      announcement_targets ( role_id )
    `,
    )
    .eq("announcement_id", id)
    .in("status", ["SCHEDULED", "PUBLISHED"])
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as RawRow;
  return {
    status: row.status,
    data: {
      announcement_id: row.announcement_id,
      title: row.title,
      body: row.body,
      published_at: row.published_at,
      created_at: row.created_at,
      author_first_name: row.users?.first_name ?? "",
      author_last_name: row.users?.last_name ?? "",
      attachments: (row.announcement_attachments ?? [])
        .sort((a, b) => a.display_order - b.display_order)
        .map((a) => ({
          attachment_id: a.attachment_id,
          storage_path: a.storage_path,
          file_name: a.file_name,
          mime_type: a.mime_type as "image/png" | "image/jpeg",
          file_size_bytes: a.file_size_bytes,
          display_order: a.display_order,
        })),
      targets: row.announcement_targets ?? [],
    },
  };
}

export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const announcementId = parseInt(id, 10);
  if (isNaN(announcementId)) notFound();

  const result = await fetchAnnouncement(announcementId);
  if (!result) notFound();

  const mode = result.status === "PUBLISHED" ? "edit-published" : "edit";

  return (
    <ProtectedRoute match="any" requiredPermissions={["announcements.full_access"]}>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 text-[#597D37]">
        Edit Announcement
      </h1>
      <CreateAnnouncementClient mode={mode} initialData={result.data} />
    </ProtectedRoute>
  );
}
