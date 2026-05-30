export const ANNOUNCEMENTS_BUCKET = "announcement-images";

export interface AnnouncementAttachment {
  attachment_id: number;
  storage_path: string;
  file_name: string;
  mime_type: "image/png" | "image/jpeg";
  display_order: number;
}

export interface AnnouncementItem {
  announcement_id: number;
  title: string;
  body: string;
  is_pinned: boolean;
  published_at: string;
  author_first_name: string;
  author_last_name: string;
  is_read: boolean;
  attachments: AnnouncementAttachment[];
}

export function getAttachmentUrl(storagePath: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${ANNOUNCEMENTS_BUCKET}/${storagePath}`;
}

export async function fetchAnnouncements(): Promise<AnnouncementItem[]> {
  const res = await fetch("/api/announcements");
  if (!res.ok) return [];
  const data = await res.json();
  return data.announcements ?? [];
}

export async function markAnnouncementRead(id: number): Promise<void> {
  await fetch(`/api/announcements/${id}/read`, { method: "POST" });
}

export async function toggleAnnouncementPin(id: number): Promise<boolean> {
  const res = await fetch(`/api/announcements/${id}/pin`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(typeof body.error === "string" ? body.error : "Failed to toggle pin");
  }
  const data = await res.json();
  return data.is_pinned as boolean;
}
