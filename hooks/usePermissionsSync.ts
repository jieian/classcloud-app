"use client";

import { useEffect, useRef } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

/** Poll every 3 minutes — low overhead, fast enough for role changes to propagate. */
const POLL_INTERVAL_MS = 3 * 60_000;

/**
 * Polls /api/auth/permissions-version and forces a JWT refresh when the
 * server-side version advances (i.e. an admin changed this user's roles or
 * permissions).  No-ops when the user is signed out.
 *
 * The version is a ms-epoch integer — either from Redis (primary) or from
 * Supabase auth.users.updated_at (fallback when Redis is unavailable).
 */
export function usePermissionsSync(user: User | null): void {
  const supabase = getSupabase();
  const lastVersionRef = useRef<number | null>(null);

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

        if (lastVersionRef.current !== null && version > lastVersionRef.current) {
          // Permissions changed server-side — refresh JWT to pull new claims.
          // This triggers onAuthStateChange in useSupabaseSession which re-reads
          // app_metadata and propagates updated roles/permissions into the UI.
          await supabase.auth.refreshSession();
        }

        lastVersionRef.current = version;
      } catch {
        // Network error or route unavailable — silently skip this tick.
      }
    };

    poll(); // immediate check on mount / user change
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      alive = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
}
