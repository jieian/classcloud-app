"use client";

import { useEffect, useRef } from "react";
import { getSupabase } from "@/lib/supabase/client";
import {
  badgeUserChannel,
  BADGE_TRANSFER_CHANNEL,
  BADGE_EVENT,
} from "@/lib/badgeChannels";

// Fallback safety-net poll for signals missed while the websocket was down.
// The Broadcast push is the primary path; NavBar also refreshes on navigation
// and tab-focus, so this only needs to cover a client sitting idle on one page.
const FALLBACK_POLL_MS = 10 * 60_000;

// Collapse a burst of signals (e.g. several notifications inserted at once)
// into a single re-fetch.
const DEBOUNCE_MS = 300;

// Spread simultaneous reconnect-recovery fetches so N clients don't all hit
// /api/badges at the same instant (full-jitter, matching usePermissionsSync).
const RECONNECT_JITTER_MAX_MS = 5_000;

/**
 * Keeps NavBar badge counts live by subscribing to the per-user badge channel
 * (notification + signup changes) and — for transfer reviewers — the shared
 * pending-transfer channel. On any "changed" signal it debounces, then calls
 * `onChange` (NavBar's /api/badges re-fetch). Audit #2: replaces per-navigation
 * polling for freshness with event-driven refresh, with polling kept only as a
 * fallback.
 *
 * Signals are content-free; the authoritative counts come from the
 * authenticated /api/badges fetch in `onChange`.
 */
export function useBadgeSync(
  userId: string | null,
  canReviewTransfers: boolean,
  onChange: () => void,
): void {
  const supabase = getSupabase();
  // Ref so the latest onChange is always used without re-subscribing.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribedOnceRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;

    const trigger = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (alive) onChangeRef.current();
      }, DEBOUNCE_MS);
    };

    // Per-user channel: this user's unread notification / signup counts.
    const userChannel = supabase
      .channel(badgeUserChannel(userId))
      .on("broadcast", { event: BADGE_EVENT }, trigger)
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          if (subscribedOnceRef.current && alive) {
            // Reconnected — recover any signal missed while disconnected.
            const delay = Math.random() * RECONNECT_JITTER_MAX_MS;
            setTimeout(() => { if (alive) onChangeRef.current(); }, delay);
          }
          subscribedOnceRef.current = true;
        }
      });

    // Shared channel: the school-wide PENDING transfer count (reviewers only).
    let transferChannel: ReturnType<typeof supabase.channel> | null = null;
    if (canReviewTransfers) {
      transferChannel = supabase
        .channel(BADGE_TRANSFER_CHANNEL)
        .on("broadcast", { event: BADGE_EVENT }, trigger)
        .subscribe();
    }

    const interval = setInterval(() => {
      if (alive) onChangeRef.current();
    }, FALLBACK_POLL_MS);

    return () => {
      alive = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      clearInterval(interval);
      supabase.removeChannel(userChannel);
      if (transferChannel) supabase.removeChannel(transferChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, canReviewTransfers]);
}
