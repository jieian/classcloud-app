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
import { useRouter } from "next/navigation";

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

function isSupabaseLockTimeout(message: string): boolean {
  return /Navigator LockManager lock/i.test(message) && /timed out/i.test(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  firstName: string;
  lastName: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUserName: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // Hydrate from storage on mount (client-only) so navigation can render
  // immediately in new tabs while the fresh async fetch runs.
  useEffect(() => {
    try {
      const cachedRoles =
        localStorage.getItem("cc_roles") ?? sessionStorage.getItem("cc_roles");
      const cachedPermissions =
        localStorage.getItem("cc_permissions") ?? sessionStorage.getItem("cc_permissions");
      if (cachedRoles) setRoles(JSON.parse(cachedRoles));
      if (cachedPermissions) setPermissions(JSON.parse(cachedPermissions));
    } catch {
      // storage unavailable
    }
  }, []);

  const router = useRouter();
  const supabase = getSupabase();

  const fetchUserRoles = async (
    authUserId: string,
    retries = 2,
  ): Promise<Role[] | null> => {
    const { data, error } = await supabase
      .from("users")
      .select("user_roles(role_id, roles(role_id, name))")
      .eq("uid", authUserId)
      .eq("active_status", 1)
      .maybeSingle();

    if (error) {
      if (retries > 0 && isSupabaseLockTimeout(error.message)) {
        await delay(250);
        return fetchUserRoles(authUserId, retries - 1);
      }
      console.error("Failed to fetch roles:", error.message);
      // Return null to signal "keep current/cached values" on transient failures.
      return null;
    }

    const userRoles = (data?.user_roles ?? []) as UserRoleJoinRow[];
    return userRoles
      .filter((row) => row.roles !== null)
      .map((row) => ({
        role_id: row.roles!.role_id,
        name: row.roles!.name,
      }));
  };

  const fetchUserPermissions = async (
    authUserId: string,
    retries = 2,
  ): Promise<string[] | null> => {
    const { data, error} = await supabase.rpc("get_user_permissions", {
      user_uuid: authUserId,
    });

    if (error) {
      if (retries > 0 && isSupabaseLockTimeout(error.message)) {
        await delay(250);
        return fetchUserPermissions(authUserId, retries - 1);
      }
      console.error("Failed to fetch permissions:", error.message);
      // Return null to signal "keep current/cached values" on transient failures.
      return null;
    }

    const permissionRows = (data ?? []) as PermissionRow[];
    return permissionRows.map((p) => p.permission_name);
  };

  const fetchUserName = async (authUserId: string): Promise<void> => {
    const { data, error } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('uid', authUserId)
      .maybeSingle();

    if (error || !data) return;
    setFirstName(data.first_name ?? '');
    setLastName(data.last_name ?? '');
  };

  const refreshUserName = async (): Promise<void> => {
    if (!user) return;
    await fetchUserName(user.id);
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

    // If auth lock contention occurred, do not wipe existing/cached permissions.
    if (!fetchedRoles || !fetchedPermissions) {
      return;
    }

    setRoles(fetchedRoles);
    setPermissions(fetchedPermissions);

    // Cache for instant hydration on reload
    try {
      localStorage.setItem("cc_roles", JSON.stringify(fetchedRoles));
      localStorage.setItem("cc_permissions", JSON.stringify(fetchedPermissions));
      sessionStorage.setItem("cc_roles", JSON.stringify(fetchedRoles));
      sessionStorage.setItem("cc_permissions", JSON.stringify(fetchedPermissions));
    } catch {
      // storage unavailable
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
              (localStorage.getItem("cc_roles") ?? sessionStorage.getItem("cc_roles")) &&
              (localStorage.getItem("cc_permissions") ?? sessionStorage.getItem("cc_permissions"))
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
          await Promise.all([
            withTimeout(fetchUserData(currentUser.id), 15000, "fetchUserData"),
            fetchUserName(currentUser.id),
          ]);
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

  // Ensure authenticated app shell is never visible when signed out.
  // No pathname check needed — AuthProvider only wraps (app)/* protected routes.
  // proxy.ts handles server-side redirects; this covers client-side session expiry.
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

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
    // Clear app-specific cached auth data immediately.
    try {
      localStorage.removeItem("cc_roles");
      localStorage.removeItem("cc_permissions");
      sessionStorage.removeItem("cc_roles");
      sessionStorage.removeItem("cc_permissions");
    } catch {
      // storage unavailable
    }

    // Optimistically clear in-memory state to prevent stale nav state.
    setUser(null);
    setRoles([]);
    setPermissions([]);
    setFirstName('');
    setLastName('');
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
      value={{ user, roles, permissions, loading, firstName, lastName, signIn, signOut, refreshUserName }}
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
