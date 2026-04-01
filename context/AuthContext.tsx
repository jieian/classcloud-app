"use client";

/**
 * Authentication Context
 * Optimized for Next.js 16 + React 19
 * - Parallelized queries for 2x faster load times
 * - Migrated to @supabase/ssr
 * - Should only wrap authenticated routes in app/(app)/layout.tsx
 *
 * Composed from:
 *   useSupabaseSession — session subscription, bootstrap, watchdog
 *   usePermissions     — roles/permissions/name fetch + sessionStorage cache
 */

import { createContext, useCallback, useContext, useEffect, ReactNode } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import { usePermissions } from "@/hooks/usePermissions";

interface Role {
  role_id: number;
  name: string;
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

function clearSupabaseClientAuthArtifacts() {
  if (typeof window === "undefined") return;

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
      .then((value) => { clearTimeout(timer); resolve(value); })
      .catch((error) => { clearTimeout(timer); reject(error); });
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const router = useRouter();

  const {
    roles,
    permissions,
    firstName,
    lastName,
    loadForUser,
    clearAll,
    refreshUserName: refreshName,
  } = usePermissions();

  const { user, loading } = useSupabaseSession({
    onUserResolved: loadForUser,
    onSessionCleared: clearAll,
  });

  // Ensure authenticated app shell is never visible when signed out.
  // proxy.ts handles server-side redirects; this covers client-side session expiry.
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
  };

  const signOut = async () => {
    clearAll();
    clearSupabaseClientAuthArtifacts();

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
      if (typeof window !== "undefined") {
        window.location.replace("/login?logout=1");
      } else {
        router.replace("/login?logout=1");
      }
    }
  };

  const refreshUserName = useCallback(async () => {
    if (!user) return;
    await refreshName(user.id);
  }, [user, refreshName]);

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
