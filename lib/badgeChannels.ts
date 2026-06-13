/**
 * Realtime Broadcast channel names for NavBar badge liveness (audit #2).
 *
 * Shared by the server (lib/services/badgeCache.ts broadcasts on invalidation)
 * and the client (hooks/useBadgeSync.ts subscribes). Kept in this dependency-
 * free module so importing it never pulls server-only code (adminClient/redis)
 * into the client bundle — and so the channel names can never drift between
 * the two sides.
 *
 * Signals are CONTENT-FREE (empty payload): a "changed" event just tells the
 * client to re-fetch /api/badges, which re-authenticates and re-authorizes the
 * actual counts. So even though Broadcast channels are not access-controlled,
 * no data is exposed through them.
 */

/** Per-user channel: that user's unread notification / signup counts changed. */
export const badgeUserChannel = (uid: string) => `badges:${uid}`;

/** Shared channel: the school-wide PENDING transfer count changed (reviewers). */
export const BADGE_TRANSFER_CHANNEL = "badges:transfers";

/** The single broadcast event name carried on both channels. */
export const BADGE_EVENT = "changed";
