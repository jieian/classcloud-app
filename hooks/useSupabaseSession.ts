"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { Session, AuthChangeEvent } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

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
   * Called when a session is resolved. Receives the user ID and should load
   * permissions. Returns true if cached data existed (allows early loading=false).
   */
  onUserResolved: (userId: string) => Promise<boolean>;
  /** Called when the session is cleared (sign-out, token failure). */
  onSessionCleared: () => void;
}

export interface UseSupabaseSessionResult {
  user: User | null;
  loading: boolean;
}

export function useSupabaseSession({
  onUserResolved,
  onSessionCleared,
}: UseSupabaseSessionOptions): UseSupabaseSessionResult {
  const supabase = getSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Prevent concurrent applySession calls and double-invocation from
  // onAuthStateChange + getSession bootstrap racing each other.
  const applyInFlightRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let settled = false;

    const applySession = async (session: Session | null) => {
      if (!alive || applyInFlightRef.current) return;
      applyInFlightRef.current = true;

      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        try {
          const hasCached = await withTimeout(
            onUserResolved(currentUser.id),
            15000,
            "loadForUser",
          );
          // Unblock the UI immediately if cache existed; the fresh fetch
          // already ran inside onUserResolved.
          if (hasCached && alive) {
            setLoading(false);
            settled = true;
          }
        } catch (error) {
          console.warn("[auth] loadForUser background refresh failed:", error);
        }
      } else {
        onSessionCleared();
      }

      if (alive) setLoading(false);
      settled = true;
      applyInFlightRef.current = false;
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
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

        await applySession(session);
      },
    );

    // Bootstrap in case INITIAL_SESSION is delayed or missed on tab restore.
    withTimeout<{ data: { session: Session | null } }>(
      supabase.auth.getSession(),
      10000,
      "getSession",
    )
      .then(async ({ data }) => {
        await applySession(data.session ?? null);
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
