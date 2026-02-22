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
  // so no need for a separate getSession() call.
  // Empty deps [] = subscribe once on mount, never tear down until unmount.
  useEffect(() => {
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

      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        await fetchUserData(currentUser.id);
      } else {
        setRoles([]);
        setPermissions([]);
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle post-login redirect separately so it doesn't affect the subscription
  useEffect(() => {
    if (user && pathname === "/login") {
      router.replace("/");
    }
  }, [user, pathname, router]);

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
    setLoading(true);

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

    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error && !/session.*missing/i.test(error.message)) {
        console.error("Logout error:", error.message);
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setLoading(false);
      router.replace("/login");
      router.refresh();
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
