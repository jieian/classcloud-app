"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

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

export interface UsePermissionsResult {
  roles: Role[];
  permissions: string[];
  firstName: string;
  lastName: string;
  /** Load fresh roles/permissions/name for a given user ID. */
  loadForUser: (userId: string) => Promise<boolean>;
  /** Wipe all in-memory permission state (on sign-out). */
  clearAll: () => void;
  refreshUserName: (userId: string) => Promise<void>;
}

export function usePermissions(): UsePermissionsResult {
  const supabase = getSupabase();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // Hydrate from sessionStorage on mount — unblocks navigation immediately
  // while the authoritative DB fetch runs in the background.
  // sessionStorage is cleared on tab close, so stale data never persists.
  useEffect(() => {
    try {
      const cachedRoles = sessionStorage.getItem("cc_roles");
      const cachedPermissions = sessionStorage.getItem("cc_permissions");
      if (cachedRoles) setRoles(JSON.parse(cachedRoles));
      if (cachedPermissions) setPermissions(JSON.parse(cachedPermissions));
    } catch {
      // storage unavailable
    }
  }, []);

  const fetchUserRoles = useCallback(
    async (authUserId: string, retries = 2): Promise<Role[] | null> => {
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
        return null;
      }

      const userRoles = (data?.user_roles ?? []) as UserRoleJoinRow[];
      return userRoles
        .filter((row) => row.roles !== null)
        .map((row) => ({ role_id: row.roles!.role_id, name: row.roles!.name }));
    },
    [supabase],
  );

  const fetchUserPermissions = useCallback(
    async (authUserId: string, retries = 2): Promise<string[] | null> => {
      const { data, error } = await supabase.rpc("get_user_permissions", {
        user_uuid: authUserId,
      });

      if (error) {
        if (retries > 0 && isSupabaseLockTimeout(error.message)) {
          await delay(250);
          return fetchUserPermissions(authUserId, retries - 1);
        }
        console.error("Failed to fetch permissions:", error.message);
        return null;
      }

      return ((data ?? []) as PermissionRow[]).map((p) => p.permission_name);
    },
    [supabase],
  );

  const refreshUserName = useCallback(
    async (userId: string): Promise<void> => {
      const { data, error } = await supabase
        .from("users")
        .select("first_name, last_name")
        .eq("uid", userId)
        .maybeSingle();

      if (error || !data) return;
      setFirstName(data.first_name ?? "");
      setLastName(data.last_name ?? "");
    },
    [supabase],
  );

  /**
   * Fetches roles, permissions, and name in parallel.
   * Returns true if sessionStorage cache existed (caller can setLoading(false) early).
   * Returns false if no cache — caller should wait for the fetch to complete.
   * Does nothing (returns false) if the fetch fails due to lock contention.
   */
  const loadForUser = useCallback(
    async (userId: string): Promise<boolean> => {
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

      const [fetchedRoles, fetchedPermissions] = await Promise.all([
        fetchUserRoles(userId),
        fetchUserPermissions(userId),
        refreshUserName(userId),
      ]);

      if (!fetchedRoles || !fetchedPermissions) return hasCached;

      setRoles(fetchedRoles);
      setPermissions(fetchedPermissions);

      try {
        sessionStorage.setItem("cc_roles", JSON.stringify(fetchedRoles));
        sessionStorage.setItem("cc_permissions", JSON.stringify(fetchedPermissions));
      } catch {
        // storage unavailable
      }

      return hasCached;
    },
    [fetchUserRoles, fetchUserPermissions, refreshUserName],
  );

  const clearAll = useCallback(() => {
    setRoles([]);
    setPermissions([]);
    setFirstName("");
    setLastName("");
    try {
      sessionStorage.removeItem("cc_roles");
      sessionStorage.removeItem("cc_permissions");
    } catch {
      // storage unavailable
    }
  }, []);

  return {
    roles,
    permissions,
    firstName,
    lastName,
    loadForUser,
    clearAll,
    refreshUserName,
  };
}
