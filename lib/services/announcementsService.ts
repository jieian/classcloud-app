export const ANNOUNCEMENTS_BUCKET = "announcement-images";

// ─── Scheduled announcement types ─────────────────────────────────────────────

export interface ScheduledAttachment {
  attachment_id: number;
  storage_path: string;
  file_name: string;
  mime_type: "image/png" | "image/jpeg";
  file_size_bytes: number;
  display_order: number;
}

export interface ScheduledAnnouncementItem {
  announcement_id: number;
  title: string;
  body: string;
  published_at: string;
  created_at: string;
  author_first_name: string;
  author_last_name: string;
  attachments: ScheduledAttachment[];
  /** null role_id means "Everyone" */
  targets: { role_id: number | null }[];
}

export interface CreateAnnouncementPayload {
  title: string;
  body: string;
  status: "PUBLISHED" | "SCHEDULED";
  published_at: string;
  everyone: boolean;
  roleIds: number[];
  attachments: {
    storage_path: string;
    file_name: string;
    mime_type: string;
    file_size_bytes: number;
    display_order: number;
  }[];
}

export interface UpdateAnnouncementPayload {
  title: string;
  body: string;
  published_at?: string;
  everyone: boolean;
  roleIds: number[];
  attachments: {
    storage_path: string;
    file_name: string;
    mime_type: string;
    file_size_bytes: number;
    display_order: number;
  }[];
}

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

export async function createAnnouncement(payload: CreateAnnouncementPayload): Promise<{ announcement_id: number }> {
  const res = await fetch("/api/announcements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(typeof body.error === "string" ? body.error : "Failed to create announcement");
  }
  return res.json();
}

export async function fetchScheduledAnnouncements(): Promise<ScheduledAnnouncementItem[]> {
  const res = await fetch("/api/announcements/scheduled");
  if (!res.ok) return [];
  const data = await res.json();
  return data.announcements ?? [];
}

export async function publishAnnouncement(id: number): Promise<void> {
  const res = await fetch(`/api/announcements/${id}/publish`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(typeof body.error === "string" ? body.error : "Failed to publish announcement");
  }
}

export async function deleteAnnouncement(id: number): Promise<void> {
  const res = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(typeof body.error === "string" ? body.error : "Failed to delete announcement");
  }
}

export async function updateAnnouncement(id: number, payload: UpdateAnnouncementPayload): Promise<void> {
  const res = await fetch(`/api/announcements/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(typeof body.error === "string" ? body.error : "Failed to update announcement");
  }
}
