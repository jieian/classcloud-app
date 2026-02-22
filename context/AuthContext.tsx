"use client";

/**
 * Authentication Context
 * Optimized for Next.js 16 + React 19
 * - Parallelized queries for 2x faster load times
 * - Migrated to @supabase/ssr
 * - Should only wrap authenticated routes in app/(app)/layout.tsx
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { getSupabase } from "@/lib/supabase/client";
import { User, Session, AuthChangeEvent } from "@supabase/supabase-js";
import { useRouter, usePathname } from "next/navigation";

interface Role {
  role_id: number;
  name: string;
}

interface UserRoleJoinRow {
  roles: Role | null;
}

interface PermissionRow {
  permission_name: string;
}

function clearSupabaseClientAuthArtifacts() {
  if (typeof window === "undefined") return;

  // Clear Supabase auth entries from local/session storage.
  try {
    const localKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-")) localKeys.push(key);
    }
    localKeys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore storage failures
  }

  try {
    const sessionKeys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith("sb-")) sessionKeys.push(key);
    }
    sessionKeys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // ignore storage failures
  }

  // Best-effort clear Supabase cookies on current host and parent domain.
  try {
    const host = window.location.hostname;
    const parentDomain =
      host.includes(".") ? `.${host.split(".").slice(-2).join(".")}` : undefined;
    const cookies = document.cookie ? document.cookie.split(";") : [];
    cookies.forEach((cookie) => {
      const name = cookie.split("=")[0]?.trim();
      if (!name || !name.startsWith("sb-")) return;
      document.cookie = `${name}=; Max-Age=0; path=/;`;
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${host};`;
      if (parentDomain) {
        document.cookie = `${name}=; Max-Age=0; path=/; domain=${parentDomain};`;
      }
    });
  } catch {
    // ignore cookie failures
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

interface AuthContextType {
  user: User | null;
  roles: Role[];
  permissions: string[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Hydrate from sessionStorage on mount (client-only) so NavBar has
  // cached permissions immediately while the fresh async fetch runs.
  useEffect(() => {
    try {
      const cachedRoles = sessionStorage.getItem("cc_roles");
      const cachedPermissions = sessionStorage.getItem("cc_permissions");
      if (cachedRoles) setRoles(JSON.parse(cachedRoles));
      if (cachedPermissions) setPermissions(JSON.parse(cachedPermissions));
    } catch {
      // sessionStorage unavailable
    }
  }, []);

  const router = useRouter();
  const pathname = usePathname();
  const supabase = getSupabase();

  const fetchUserRoles = async (authUserId: string): Promise<Role[]> => {
    const { data, error } = await supabase
      .from("users")
      .select("user_roles(role_id, roles(role_id, name))")
      .eq("uid", authUserId)
      .eq("active_status", 1)
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch roles:", error.message);
      return [];
    }

    const userRoles = (data?.user_roles ?? []) as UserRoleJoinRow[];
    return userRoles
      .filter((row) => row.roles !== null)
      .map((row) => ({
        role_id: row.roles!.role_id,
        name: row.roles!.name,
      }));
  };

  const fetchUserPermissions = async (authUserId: string) => {
    const { data, error} = await supabase.rpc("get_user_permissions", {
      user_uuid: authUserId,
    });

    if (error) {
      console.error("Failed to fetch permissions:", error.message);
      return [];
    }

    const permissionRows = (data ?? []) as PermissionRow[];
    return permissionRows.map((p) => p.permission_name);
  };

  /**
   * Fetches roles and permissions in parallel for performance
   * Cuts load time in half compared to sequential fetches
   * Uses UUID to link auth.users.id with users.id
   */
  const fetchUserData = async (userId: string) => {
    const [fetchedRoles, fetchedPermissions] = await Promise.all([
      fetchUserRoles(userId),
      fetchUserPermissions(userId),
    ]);

    setRoles(fetchedRoles);
    setPermissions(fetchedPermissions);

    // Cache for instant hydration on reload
    try {
      sessionStorage.setItem("cc_roles", JSON.stringify(fetchedRoles));
      sessionStorage.setItem("cc_permissions", JSON.stringify(fetchedPermissions));
    } catch {
      // sessionStorage unavailable (e.g. private browsing quota exceeded)
    }
  };

  // Single subscription — onAuthStateChange fires INITIAL_SESSION on setup,
  // but on some tab-restore paths this can be delayed, so we also bootstrap
  // with an explicit getSession() call.
  // Empty deps [] = subscribe once on mount, never tear down until unmount.
  useEffect(() => {
    let alive = true;
    let settled = false;
    let applySessionInFlight = false;

    const applySession = async (session: Session | null) => {
      if (!alive || applySessionInFlight) return;
      applySessionInFlight = true;
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        // If cached roles/permissions exist, unblock the UI immediately
        // and let the fresh fetch run silently in the background.
        const hasCached = (() => {
          try {
            return !!(
              sessionStorage.getItem("cc_roles") &&
              sessionStorage.getItem("cc_permissions")
            );
          } catch {
            return false;
          }
        })();

        if (hasCached && alive) {
          setLoading(false);
          settled = true;
        }

        try {
          await withTimeout(fetchUserData(currentUser.id), 15000, "fetchUserData");
        } catch (error) {
          // Non-fatal: cached data is already displayed.
          console.warn("[auth] fetchUserData background refresh failed:", error);
        }
      } else {
        setRoles([]);
        setPermissions([]);
      }

      if (alive) setLoading(false);
      settled = true;
      applySessionInFlight = false;
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      // Handle invalid/expired refresh token
      if (event === "TOKEN_REFRESHED" && !session) {
        setUser(null);
        setRoles([]);
        setPermissions([]);
        setLoading(false);
        window.location.href = "/login";
        return;
      }

      if (event === "SIGNED_OUT") {
        setUser(null);
        setRoles([]);
        setPermissions([]);
        setLoading(false);
        return;
      }

      await applySession(session);
    });

    // Bootstrap auth state in case INITIAL_SESSION is delayed/missed.
    withTimeout<{ data: { session: Session | null } }>(
      supabase.auth.getSession(),
      10000,
      "getSession",
    )
      .then(async ({ data }: { data: { session: Session | null } }) => {
        await applySession(data.session ?? null);
      })
      .catch(() => {
        if (!alive) return;
        setUser(null);
        setRoles([]);
        setPermissions([]);
        setLoading(false);
        settled = true;
      });

    // Absolute safety net: never allow infinite loading in restored/new tabs.
    const watchdog = setTimeout(() => {
      if (!alive || settled) return;
      setUser(null);
      setRoles([]);
      setPermissions([]);
      setLoading(false);
    }, 20000);

    return () => {
      alive = false;
      clearTimeout(watchdog);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle post-login redirect separately so it doesn't affect the subscription
  useEffect(() => {
    if (user && pathname === "/login" && !isLoggingOut) {
      const requestedNext =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next")
          : null;
      const safeNext =
        requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
          ? requestedNext
          : "/";
      router.replace(safeNext);
    }
  }, [user, pathname, router, isLoggingOut]);

  // Ensure authenticated app shell is never visible when signed out.
  useEffect(() => {
    if (!loading && !user && pathname !== "/login") {
      router.replace("/login");
    }
  }, [loading, user, pathname, router]);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(), // Trim whitespace for better UX
        password,
      });
      if (error) throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setIsLoggingOut(true);

    // Clear app-specific cached auth data immediately.
    try {
      sessionStorage.removeItem("cc_roles");
      sessionStorage.removeItem("cc_permissions");
    } catch {
      // sessionStorage unavailable
    }

    // Optimistically clear in-memory state to prevent stale nav state.
    setUser(null);
    setRoles([]);
    setPermissions([]);
    setLoading(false);
    clearSupabaseClientAuthArtifacts();

    // Try to invalidate Supabase session token, but don't block forever.
    try {
      const result = await withTimeout<{ error: { message: string } | null }>(
        supabase.auth.signOut({ scope: "global" }),
        4000,
        "signOut",
      );
      const error = result.error;
      if (error && !/session.*missing/i.test(error.message)) {
        console.error("Logout error:", error.message);
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      clearSupabaseClientAuthArtifacts();
      setIsLoggingOut(false);
      // Hard navigation guarantees app state resets fully.
      if (typeof window !== "undefined") {
        window.location.replace("/login?logout=1");
      } else {
        router.replace("/login?logout=1");
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, roles, permissions, loading, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
