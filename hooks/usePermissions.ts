"use client";

import { useCallback, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface Role {
  role_id: number;
  name: string;
}

export interface UsePermissionsResult {
  roles: Role[];
  permissions: string[];
  firstName: string;
  lastName: string;
  /** Read permissions and roles from the user's JWT app_metadata (sync, no DB). */
  loadFromUser: (user: User | null) => void;
  /** Wipe all in-memory permission state (on sign-out). */
  clearAll: () => void;
  /** Fetch the user's display name from the DB. */
  refreshUserName: (userId: string) => Promise<void>;
}

export function usePermissions(): UsePermissionsResult {
  const supabase = getSupabase();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  /**
   * Reads permissions and roles directly from the user's JWT app_metadata.
   * No DB round-trip — data is embedded in the session token by syncUserPermissions.
   */
  const loadFromUser = useCallback((user: User | null) => {
    if (!user) {
      setRoles([]);
      setPermissions([]);
      return;
    }
    const meta = user.app_metadata ?? {};
    setPermissions(Array.isArray(meta.permissions) ? (meta.permissions as string[]) : []);
    setRoles(Array.isArray(meta.roles) ? (meta.roles as Role[]) : []);
  }, []);

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

  const clearAll = useCallback(() => {
    setRoles([]);
    setPermissions([]);
    setFirstName("");
    setLastName("");
  }, []);

  return {
    roles,
    permissions,
    firstName,
    lastName,
    loadFromUser,
    clearAll,
    refreshUserName,
  };
}
