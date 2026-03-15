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
  useRef,
  useState,
  ReactNode,
} from "react";
import { Modal, Text, Button, Group, Stack } from "@mantine/core";
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

interface RolesResult {
  roles: Role[];
  firstName: string;
  lastName: string;
  /** True when the account is inactive/deleted — signOut already triggered. */
  deactivated: boolean;
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
  /** True once permissions have been successfully loaded from DB or cache. */
  permissionsLoaded: boolean;
  firstName: string;
  lastName: string;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-fetches first/last name from DB and updates context + sessionStorage. */
  refreshUserName: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showSessionWarning, setShowSessionWarning] = useState(false);
  const [sessionCountdown, setSessionCountdown] = useState(120);
  const signOutRef = useRef<() => Promise<void>>(async () => {});

  const INACTIVITY_MS = 2 * 60 * 60 * 1000; // 2 hours
  const WARNING_MS = 2 * 60 * 1000;          // warn 2 minutes before logout

  // Hydrate from sessionStorage on mount (client-only) so NavBar has
  // cached permissions immediately while the fresh async fetch runs.
  useEffect(() => {
    try {
      const cachedRoles = sessionStorage.getItem("cc_roles");
      const cachedPermissions = sessionStorage.getItem("cc_permissions");
      const cachedFirstName = sessionStorage.getItem("cc_first_name");
      const cachedLastName = sessionStorage.getItem("cc_last_name");
      if (cachedRoles) setRoles(JSON.parse(cachedRoles));
      if (cachedPermissions) {
        setPermissions(JSON.parse(cachedPermissions));
        // Cache is present — permissions are usable immediately.
        setPermissionsLoaded(true);
      }
      if (cachedFirstName) setFirstName(cachedFirstName);
      if (cachedLastName) setLastName(cachedLastName);
    } catch {
      // sessionStorage unavailable
    }
  }, []);

  const router = useRouter();
  const pathname = usePathname();
  const supabase = getSupabase();

  const fetchUserRoles = async (authUserId: string): Promise<RolesResult> => {
    const { data, error } = await supabase
      .from("users")
      .select("first_name, last_name, user_roles(role_id, roles(role_id, name))")
      .eq("uid", authUserId)
      .eq("active_status", 1)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch roles: ${error.message}`);
    }

    // No row means the account is inactive, pending, or soft-deleted.
    // Sign out immediately so they can't linger with cached credentials.
    if (!data) {
      supabase.auth.signOut({ scope: "global" }).catch(() => {});
      return { roles: [], firstName: "", lastName: "", deactivated: true };
    }

    const userRoles = (data.user_roles ?? []) as UserRoleJoinRow[];
    return {
      roles: userRoles
        .filter((row) => row.roles !== null)
        .map((row) => ({
          role_id: row.roles!.role_id,
          name: row.roles!.name,
        })),
      firstName: (data as { first_name: string }).first_name ?? "",
      lastName: (data as { last_name: string }).last_name ?? "",
      deactivated: false,
    };
  };

  const fetchUserPermissions = async (authUserId: string) => {
    const { data, error } = await supabase.rpc("get_user_permissions", {
      user_uuid: authUserId,
    });

    if (error) {
      throw new Error(`Failed to fetch permissions: ${error.message}`);
    }

    const permissionRows = (data ?? []) as PermissionRow[];
    return permissionRows.map((p) => p.permission_name);
  };

  /**
   * Fetches roles and permissions in parallel for performance.
   * Returns true if data was successfully applied, false if skipped (deactivated).
   */
  const fetchUserData = async (userId: string): Promise<boolean> => {
    const [rolesResult, fetchedPermissions] = await Promise.all([
      fetchUserRoles(userId),
      fetchUserPermissions(userId),
    ]);

    // Account is deactivated — signOut was already triggered in fetchUserRoles.
    // Do not apply permissions; onAuthStateChange will fire SIGNED_OUT shortly.
    if (rolesResult.deactivated) {
      return false;
    }

    setRoles(rolesResult.roles);
    setPermissions(fetchedPermissions);
    setFirstName(rolesResult.firstName);
    setLastName(rolesResult.lastName);
    setPermissionsLoaded(true);

    // Cache for instant hydration on reload (same-tab refreshes)
    try {
      sessionStorage.setItem("cc_roles", JSON.stringify(rolesResult.roles));
      sessionStorage.setItem("cc_permissions", JSON.stringify(fetchedPermissions));
      sessionStorage.setItem("cc_first_name", rolesResult.firstName);
      sessionStorage.setItem("cc_last_name", rolesResult.lastName);
    } catch {
      // sessionStorage unavailable (e.g. private browsing quota exceeded)
    }

    return true;
  };

  // Single subscription — onAuthStateChange fires INITIAL_SESSION on setup,
  // but on some tab-restore paths this can be delayed, so we also bootstrap
  // with an explicit getSession() call.
  // Empty deps [] = subscribe once on mount, never tear down until unmount.
  useEffect(() => {
    let alive = true;
    let settled = false;
    let applySessionInFlight = false;
    // Last-wins queue: if a new session arrives while one is processing, we
    // store it here and process it immediately after the current one finishes.
    // undefined = nothing queued; null = queued sign-out; Session = queued session.
    let queuedSession: Session | null | undefined = undefined;

    const applySession = async (session: Session | null) => {
      if (!alive) return;

      // If already processing, queue this session (last-wins) and return.
      // This prevents silently dropping TOKEN_REFRESHED or other mid-flight events.
      if (applySessionInFlight) {
        queuedSession = session;
        return;
      }

      applySessionInFlight = true;
      queuedSession = undefined;

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
          if (hasCached) {
            // Non-fatal: cached data is already displayed.
            console.warn("[auth] fetchUserData background refresh failed:", error);
          } else {
            // No cache fallback — permissions are unknown. Keep the user
            // authenticated but mark permissions as not loaded so ProtectedRoute
            // shows a loader rather than incorrectly redirecting to /unauthorized.
            console.error("[auth] fetchUserData failed with no cache:", error);
            // permissionsLoaded stays false; user will see the loading spinner.
            // The watchdog will eventually force a resolution.
          }
        }
      } else {
        setRoles([]);
        setPermissions([]);
        setPermissionsLoaded(false);
      }

      if (alive) setLoading(false);
      settled = true;
      applySessionInFlight = false;

      // Process any session that arrived while we were in-flight.
      if (alive && queuedSession !== undefined) {
        const nextSession = queuedSession;
        queuedSession = undefined;
        await applySession(nextSession);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      // Handle invalid/expired refresh token
      if (event === "TOKEN_REFRESHED" && !session) {
        setUser(null);
        setRoles([]);
        setPermissions([]);
        setPermissionsLoaded(false);
        setLoading(false);
        window.location.href = "/login";
        return;
      }

      if (event === "SIGNED_OUT") {
        setUser(null);
        setRoles([]);
        setPermissions([]);
        setPermissionsLoaded(false);
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
        setPermissionsLoaded(false);
        setLoading(false);
        settled = true;
      });

    // Absolute safety net: never allow infinite loading in restored/new tabs.
    const watchdog = setTimeout(() => {
      if (!alive || settled) return;
      setUser(null);
      setRoles([]);
      setPermissions([]);
      setPermissionsLoaded(false);
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
  // Guard with isLoggingOut to avoid racing with window.location.replace in signOut().
  useEffect(() => {
    if (!loading && !user && !isLoggingOut && pathname !== "/login") {
      router.replace("/login");
    }
  }, [loading, user, isLoggingOut, pathname, router]);

  // Keep signOutRef current so inactivity timers always call the latest signOut.
  useEffect(() => {
    signOutRef.current = signOut;
  });

  // Inactivity session timeout — resets on any user interaction.
  useEffect(() => {
    if (!user) return;

    let inactivityTimer: ReturnType<typeof setTimeout>;
    let warningTimer: ReturnType<typeof setTimeout>;
    let countdownInterval: ReturnType<typeof setInterval>;

    const startTimers = () => {
      warningTimer = setTimeout(() => {
        setShowSessionWarning(true);
        setSessionCountdown(120);
        countdownInterval = setInterval(() => {
          setSessionCountdown((prev) => {
            if (prev <= 1) { clearInterval(countdownInterval); return 0; }
            return prev - 1;
          });
        }, 1000);
      }, INACTIVITY_MS - WARNING_MS);

      inactivityTimer = setTimeout(() => {
        signOutRef.current();
      }, INACTIVITY_MS);
    };

    const resetTimers = () => {
      clearTimeout(inactivityTimer);
      clearTimeout(warningTimer);
      clearInterval(countdownInterval);
      setShowSessionWarning(false);
      setSessionCountdown(120);
      startTimers();
    };

    const events = ["mousemove", "mousedown", "keypress", "touchstart", "scroll", "click"];
    events.forEach((e) => window.addEventListener(e, resetTimers, { passive: true }));
    startTimers();

    return () => {
      clearTimeout(inactivityTimer);
      clearTimeout(warningTimer);
      clearInterval(countdownInterval);
      events.forEach((e) => window.removeEventListener(e, resetTimers));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const refreshUserName = async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from("users")
        .select("first_name, last_name")
        .eq("uid", user.id)
        .single();
      if (data) {
        const fn = (data as { first_name: string }).first_name ?? "";
        const ln = (data as { last_name: string }).last_name ?? "";
        setFirstName(fn);
        setLastName(ln);
        try {
          sessionStorage.setItem("cc_first_name", fn);
          sessionStorage.setItem("cc_last_name", ln);
        } catch {
          // sessionStorage unavailable
        }
      }
    } catch {
      // ignore refresh failures silently
    }
  };

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
      sessionStorage.removeItem("cc_first_name");
      sessionStorage.removeItem("cc_last_name");
    } catch {
      // sessionStorage unavailable
    }

    // Optimistically clear in-memory state to prevent stale nav state.
    setUser(null);
    setRoles([]);
    setPermissions([]);
    setPermissionsLoaded(false);
    setFirstName("");
    setLastName("");
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
      value={{ user, roles, permissions, permissionsLoaded, firstName, lastName, loading, signIn, signOut, refreshUserName }}
    >
      {children}

      <Modal
        opened={showSessionWarning}
        onClose={() => { setShowSessionWarning(false); setSessionCountdown(120); }}
        title="Session Expiring Soon"
        centered
        withCloseButton={false}
        closeOnClickOutside={false}
        closeOnEscape={false}
      >
        <Stack gap="md">
          <Text size="sm">
            You have been inactive for a while. You will be automatically logged out in{" "}
            <Text span fw={700} c="red">{sessionCountdown}s</Text>.
          </Text>
          <Text size="sm" c="orange" fw={500}>
            Any unsaved changes will be lost. Please save your work before the timer runs out.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={signOut}>
              Log Out Now
            </Button>
            <Button
              color="#4EAE4A"
              onClick={() => { setShowSessionWarning(false); setSessionCountdown(120); }}
            >
              Stay Logged In
            </Button>
          </Group>
        </Stack>
      </Modal>
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
