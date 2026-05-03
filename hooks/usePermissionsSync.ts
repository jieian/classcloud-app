"use client";

import { useEffect, useRef } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

/** Fallback poll interval — safety net for missed Realtime events. */
const POLL_INTERVAL_MS = 15 * 60_000;

/**
 * sessionStorage key tracking the server permissions version at the time of
 * the last JWT refresh. If the server version advances past this value (even
 * after a full page reload), we force a session refresh so the new claims are
 * picked up immediately instead of waiting up to 3 minutes.
 */
const LAST_REFRESH_VERSION_KEY = "cc_perm_version";

function getStoredRefreshVersion(): number | null {
  try {
    const raw = sessionStorage.getItem(LAST_REFRESH_VERSION_KEY);
    const n = raw ? Number(raw) : NaN;
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

function setStoredRefreshVersion(version: number): void {
  try {
    sessionStorage.setItem(LAST_REFRESH_VERSION_KEY, String(version));
  } catch {
    // ignore storage failures
  }
}

/**
 * Polls /api/auth/permissions-version and forces a JWT refresh whenever the
 * server-side version is ahead of the version stored at the time of the last
 * refresh. This handles both the live-polling case (admin changes someone
 * else's roles) and the page-reload case (admin changes their own roles — the
 * old cached JWT is replaced on the very first poll after load).
 */
export function usePermissionsSync(user: User | null): void {
  const supabase = getSupabase();
  const lastVersionRef = useRef<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribedOnceRef = useRef(false);

  useEffect(() => {
    if (!user) {
      lastVersionRef.current = null;
      return;
    }

    let alive = true;

    const poll = async () => {
      try {
        const res = await fetch("/api/auth/permissions-version");
        if (!res.ok || !alive) return;

        const { version } = await res.json();
        if (typeof version !== "number") return;

        const storedRefreshVersion = getStoredRefreshVersion();

        // Refresh if:
        // - The server version is ahead of the last version we refreshed at
        //   (covers live changes while the page is open AND the page-reload
        //    case where the cached JWT predates the latest role change).
        // - We have never stored a refresh version (fresh session, safe to
        //   refresh once to guarantee the JWT matches current DB roles).
        const needsRefresh =
          storedRefreshVersion === null || version > storedRefreshVersion;

        if (needsRefresh) {
          await supabase.auth.refreshSession();
          setStoredRefreshVersion(version);
        }

        lastVersionRef.current = version;
      } catch {
        // Network error or route unavailable — silently skip this tick.
      }
    };

    // Tab focus: recover stale permissions when user returns to the tab.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && alive) poll();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Realtime: receive "invalidated" signals from the server after a role change.
    // On event → debounce 400ms → poll() (version check then refreshSession if needed).
    // On reconnect → poll() immediately to recover any events missed while disconnected.
    const channel = supabase
      .channel(`permissions:${user.id}`)
      .on("broadcast", { event: "invalidated" }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          if (alive) poll();
        }, 400);
      })
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          if (subscribedOnceRef.current && alive) poll(); // reconnected — recover missed events
          subscribedOnceRef.current = true;
        }
        if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && alive) {
          poll(); // channel failed — fall back to version check
        }
      });

    poll(); // immediate check on mount / user change
    const interval = setInterval(poll, POLL_INTERVAL_MS); // fallback safety net

    return () => {
      alive = false;
      clearInterval(interval);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
}
