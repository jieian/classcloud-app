"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { Session, AuthChangeEvent, User } from "@supabase/supabase-js";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    promise
      .then((value) => { clearTimeout(timer); resolve(value); })
      .catch((error) => { clearTimeout(timer); reject(error); });
  });
}

interface UseSupabaseSessionOptions {
  /**
   * Called synchronously when a session is resolved.
   * Receives the full User object — permissions are read from app_metadata,
   * so no DB fetch is needed and this never blocks loading.
   */
  onUserResolved: (user: User | null) => void;
  /** Called when the session is cleared (sign-out, token failure). */
  onSessionCleared: () => void;
  /**
   * Called after loading is set to false to refresh the display name
   * from the DB in the background (non-blocking).
   */
  onRefreshName: (userId: string) => Promise<void>;
}

export interface UseSupabaseSessionResult {
  user: User | null;
  loading: boolean;
}

export function useSupabaseSession({
  onUserResolved,
  onSessionCleared,
  onRefreshName,
}: UseSupabaseSessionOptions): UseSupabaseSessionResult {
  const supabase = getSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Prevent concurrent applySession calls racing each other.
  const applyInFlightRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let settled = false;

    const applySession = (session: Session | null) => {
      if (!alive || applyInFlightRef.current) return;
      applyInFlightRef.current = true;

      const currentUser = session?.user ?? null;
      setUser(currentUser);

      // Permissions and roles come from app_metadata — synchronous, no DB wait.
      onUserResolved(currentUser);

      if (!currentUser) {
        onSessionCleared();
      }

      if (alive) setLoading(false);
      settled = true;
      applyInFlightRef.current = false;

      // Refresh display name in background after unblocking the UI.
      if (currentUser) {
        onRefreshName(currentUser.id).catch(() => {});
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (event === "TOKEN_REFRESHED" && !session) {
          setUser(null);
          onSessionCleared();
          setLoading(false);
          window.location.href = "/login";
          return;
        }

        if (event === "SIGNED_OUT") {
          setUser(null);
          onSessionCleared();
          setLoading(false);
          return;
        }

        applySession(session);
      },
    );

    // Bootstrap in case INITIAL_SESSION is delayed or missed on tab restore.
    withTimeout<{ data: { session: Session | null } }>(
      supabase.auth.getSession(),
      10000,
      "getSession",
    )
      .then(({ data }) => {
        applySession(data.session ?? null);
      })
      .catch(() => {
        if (!alive) return;
        setUser(null);
        onSessionCleared();
        setLoading(false);
        settled = true;
      });

    // Absolute safety net: never allow infinite loading.
    const watchdog = setTimeout(() => {
      if (!alive || settled) return;
      setUser(null);
      onSessionCleared();
      setLoading(false);
    }, 20000);

    return () => {
      alive = false;
      applyInFlightRef.current = false;
      clearTimeout(watchdog);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, loading };
}
