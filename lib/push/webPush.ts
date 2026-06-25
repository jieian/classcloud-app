/**
 * Web Push fan-out (PWA Phase 2).
 *
 * Piggybacks on the notification dispatcher: every in-app notification also
 * pushes. Design follows DatabaseAuditPlan.md:
 *  - runs only on the dispatch/event path (never the navigation hot path)
 *  - ONE batched, indexed SELECT for all recipients' subscriptions
 *  - sends in sequential chunks to cap concurrency
 *  - ONE batched DELETE to prune dead (404/410) endpoints
 *  - fire-and-forget: never throws
 *
 * Lock-screen text is GENERIC (keyed by notification `type`) — no student names
 * or other PII ever leave the app via push.
 */

import webpush from "web-push";
import { adminClient as admin } from "@/lib/supabase/admin";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:classcloud.team@gmail.com";

let vapidReady = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  vapidReady = true;
} else {
  console.warn("[push] VAPID keys not set — web push will be silently skipped.");
}

export type PushItem = {
  user_id: string;
  type: string;
  action_url: string | null;
};

const GENERIC_FALLBACK = {
  title: "ClassCloud",
  body: "You have a new notification.",
};

/**
 * Generic, name-free lock-screen text keyed by notification `type`. Intentionally
 * carries no student names / PII — push text shows on lock screens and passes
 * through Apple/Google. Tap-through deep-links via the notification's action_url.
 */
const PUSH_TITLES: Record<string, { title: string; body?: string }> = {
  "transfer_request.created": {
    title: "New transfer request",
    body: "A student transfer request needs your review.",
  },
  "transfer_request.approved": { title: "Transfer request approved" },
  "transfer_request.rejected": { title: "Transfer request rejected" },
  "direct_move.added": { title: "A student was added to your class" },
  "direct_move.removed": { title: "A student was moved out of your class" },
  "reports.subject_completed": { title: "Subject reports completed" },
  "reports.group_completed": { title: "Subject group reports completed" },
  "reports.all_completed": { title: "All reports completed" },
  "class.adviser_assigned": { title: "You were assigned as adviser" },
  "class.adviser_removed": { title: "You were removed as adviser" },
  "class.subject_teachers_changed": {
    title: "Your subject teaching assignment changed",
  },
  "faculty.load_changed": { title: "Your teaching load changed" },
  "faculty.load_removed": { title: "Your teaching load was removed" },
  "faculty.coordinator_assigned": {
    title: "You were assigned as subject coordinator",
  },
  "faculty.coordinator_removed": {
    title: "You were removed as subject coordinator",
  },
  "faculty.gsl_assigned": { title: "You were assigned as grade subject leader" },
  "faculty.gsl_removed": { title: "You were removed as grade subject leader" },
  "role.changed": { title: "Your role was updated" },
  new_signup: { title: "New account pending approval" },
  "account_deletion.requested": {
    title: "Account deletion request",
    body: "A user has requested deletion of their account.",
  },
};

type SubRow = {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

// Cap concurrent push sends. Sequential per-chunk awaiting is what actually
// throttles parallelism (Promise.allSettled alone does not).
const CHUNK_SIZE = 20;

/**
 * Sends a generic push to every recipient's subscribed device(s). The `items`
 * array MUST be a faithful echo of the inserted notification rows — callers
 * pass the exact recipient uids that received an in-app notification, never a
 * recomputed list (prevents in-app vs push desyncs).
 */
export async function sendPushToUsers(items: PushItem[]): Promise<void> {
  if (!vapidReady || items.length === 0) return;
  try {
    const uids = [...new Set(items.map((i) => i.user_id).filter(Boolean))];
    if (uids.length === 0) return;

    // ONE batched, indexed read of all recipients' subscriptions.
    const { data, error } = await admin
      .from("push_subscriptions")
      .select("user_id,endpoint,p256dh,auth")
      .in("user_id", uids);
    if (error) {
      console.error("[push] subscription lookup failed:", error.message);
      return;
    }
    const subs = (data ?? []) as SubRow[];
    if (subs.length === 0) return;

    // Group subscriptions by user.
    const byUser = new Map<string, SubRow[]>();
    for (const s of subs) {
      const arr = byUser.get(s.user_id);
      if (arr) arr.push(s);
      else byUser.set(s.user_id, [s]);
    }

    // Build one send per (notification item × that user's device).
    const sends: { sub: SubRow; payload: string }[] = [];
    for (const item of items) {
      const userSubs = byUser.get(item.user_id);
      if (!userSubs) continue;
      const meta = PUSH_TITLES[item.type] ?? GENERIC_FALLBACK;
      const payload = JSON.stringify({
        title: meta.title,
        body: meta.body ?? "",
        url: item.action_url ?? "/",
      });
      for (const sub of userSubs) sends.push({ sub, payload });
    }
    if (sends.length === 0) return;

    // Send in sequential chunks of CHUNK_SIZE to cap concurrency.
    const deadEndpoints: string[] = [];
    for (let i = 0; i < sends.length; i += CHUNK_SIZE) {
      const chunk = sends.slice(i, i + CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map(({ sub, payload }) =>
          webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
          ),
        ),
      );
      results.forEach((res, idx) => {
        if (res.status !== "rejected") return;
        const err = res.reason as { statusCode?: number; message?: string };
        // 404 Not Found / 410 Gone → subscription expired; prune it.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          deadEndpoints.push(chunk[idx].sub.endpoint);
        } else {
          console.error("[push] send failed:", err?.statusCode, err?.message);
        }
      });
    }

    // Prune expired/gone subscriptions in ONE batched delete.
    if (deadEndpoints.length > 0) {
      const { error: delErr } = await admin
        .from("push_subscriptions")
        .delete()
        .in("endpoint", [...new Set(deadEndpoints)]);
      if (delErr) console.error("[push] prune failed:", delErr.message);
      else console.log(`[push] pruned ${deadEndpoints.length} dead subscription(s).`);
    }
  } catch (err) {
    console.error("[push] sendPushToUsers:", err);
  }
}
