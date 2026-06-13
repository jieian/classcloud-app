import { redis, withRedisCache } from "@/lib/redis";
import { adminClient as admin } from "@/lib/supabase/admin";
import { badgeUserChannel, BADGE_TRANSFER_CHANNEL, BADGE_EVENT } from "@/lib/badgeChannels";

// ─────────────────────────────────────────────────────────────────────────────
// NavBar badge counts, cached in Redis to take the per-navigation count queries
// off the DB hot path (audit #4 — the badge-count read was the #1 application
// query, polled on every navigation). Two cache shapes:
//
//   • badges:notif:<uid> — a user's unread totals (all + the new_signup subset).
//       Precisely invalidated at the single insertNotifications chokepoint in
//       lib/notifications.ts and on mark-read. The TTL is only a backstop for
//       the two SECURITY DEFINER insert paths (notify_new_signup,
//       notify_report_completion) that bypass that chokepoint.
//
//   • badges:transfer_pending — ONE global key for the school-wide PENDING
//       transfer count (identical for every reviewer, so a single shared key
//       avoids fanning invalidation across all reviewers). Invalidated by the
//       four transfer mutation routes; the short TTL backstops the trigger-
//       driven cancellations (student unenroll / section delete / user
//       soft-delete) that change the count without a direct route hook.
// ─────────────────────────────────────────────────────────────────────────────

// notif is precisely invalidated, so its TTL is just a safety net (longer OK);
// transfer leans on the TTL for trigger-driven changes, so keep it short.
const NOTIF_TTL = 60;
const TRANSFER_TTL = 30;

export const badgeNotifKey = (uid: string) => `badges:notif:${uid}`;
export const BADGE_TRANSFER_PENDING_KEY = "badges:transfer_pending";

export type NotificationBadge = {
  notifications: number;
  signupNotifications: number;
};

/** A user's unread notification counts (total + new_signup subset), cached. */
export async function getNotificationBadge(uid: string): Promise<NotificationBadge> {
  return withRedisCache(badgeNotifKey(uid), NOTIF_TTL, async () => {
    // One query for both counts: fetch the type of each unread row and tally in
    // JS (the unread set per user is small). Throwing on error keeps failures
    // out of the cache.
    const { data, error } = await admin
      .from("notifications")
      .select("type")
      .eq("user_id", uid)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { type: string }[];
    return {
      notifications: rows.length,
      signupNotifications: rows.filter((r) => r.type === "new_signup").length,
    };
  });
}

/** School-wide count of PENDING transfer requests, cached under one key. */
export async function getPendingTransferBadge(): Promise<number> {
  return withRedisCache(BADGE_TRANSFER_PENDING_KEY, TRANSFER_TTL, async () => {
    const { count, error } = await admin
      .from("section_transfer_requests")
      .select("request_id", { count: "exact", head: true })
      .eq("status", "PENDING");
    if (error) throw new Error(error.message);
    return count ?? 0;
  });
}

/** Evicts the cached notification counts for one or more users. */
export async function invalidateNotificationBadge(
  uid: string | string[],
): Promise<void> {
  const uids = [...new Set((Array.isArray(uid) ? uid : [uid]).filter(Boolean))];
  if (uids.length === 0) return;
  await redis.del(...uids.map(badgeNotifKey));
  // Push a content-free "changed" signal so each recipient's NavBar re-fetches
  // live instead of waiting for the next navigation/focus (audit #2).
  await Promise.allSettled(uids.map((u) => broadcastBadgeChange(badgeUserChannel(u))));
}

/** Evicts the global pending-transfer count. Call after any transfer status change. */
export async function invalidatePendingTransferBadge(): Promise<void> {
  await redis.del(BADGE_TRANSFER_PENDING_KEY);
  // One signal on the shared channel updates every subscribed reviewer's badge.
  await broadcastBadgeChange(BADGE_TRANSFER_CHANNEL);
}

/**
 * Fires a content-free Realtime Broadcast on `channel` (server-side HTTP send,
 * mirroring permissions-sync). Best-effort: a failure never blocks the caller —
 * the NavBar's throttled navigation/focus refresh and the hook's fallback poll
 * recover any missed signal.
 */
async function broadcastBadgeChange(channel: string): Promise<void> {
  try {
    await admin.channel(channel).httpSend(BADGE_EVENT, {});
  } catch (err) {
    console.warn(`[badgeCache] realtime broadcast failed for ${channel}:`, err);
  }
}
