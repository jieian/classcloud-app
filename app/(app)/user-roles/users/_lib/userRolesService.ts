import { getSupabase } from "@/lib/supabase/client";

const supabase = getSupabase();

export interface Role {
  role_id: number;
  name: string;
}

export interface User {
  user_id: number;
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  active_status: number;
}

export interface UserWithRoles {
  user_id: number;
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  roles: Role[];
}

export interface PendingUser {
  user_id: number;
  id: string; // UUID linked to auth.users
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
}

export async function fetchPendingUserCount(): Promise<number> {
  const { count, error } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("active_status", 0);

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error fetching pending user count:", error);
    }
    throw error;
  }

  return count ?? 0;
}

/** Returns true if the value looks like a real name (letters/spaces only) */
function isValidName(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && /^[a-zA-Z\s]+$/.test(value.trim());
}

export async function fetchPendingUsers(): Promise<PendingUser[]> {
  const { data, error } = await supabase
    .from("users")
    .select("user_id, id, first_name, middle_name, last_name, email")
    .eq("active_status", 0)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error fetching pending users:", error);
    }
    throw error;
  }

  return (data || []).map((user: any) => ({
    ...user,
    middle_name: isValidName(user.middle_name) ? user.middle_name : undefined,
  }));
}

/**
 * Checks if an email is already in use by another user.
 * Returns true if the email is taken (by a different user_id).
 */
export async function checkEmailExists(
  email: string,
  excludeUserId: number,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true })
    .ilike("email", email.trim())
    .neq("user_id", excludeUserId);

  if (error) {
    console.error("Error checking email uniqueness:", error);
    throw new Error("Failed to verify email availability.");
  }

  return (count ?? 0) > 0;
}

export async function fetchActiveUsersWithRoles(): Promise<UserWithRoles[]> {
  try {
    const startTime = performance.now();

    // Optimized query: Fetch active users with their associated roles through the join table
    const { data, error } = await supabase
      .from("users")
      .select(
        `
        user_id,
        first_name,
        middle_name,
        last_name,
        email,
        user_roles (
          roles (
            role_id,
            name
          )
        )
      `
      )
      .eq("active_status", 1)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });

    const queryTime = performance.now() - startTime;

    // Performance logging only in development
    if (process.env.NODE_ENV === "development") {
      console.log(`[Performance] Users query took ${queryTime.toFixed(2)}ms`);
    }

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching users with roles:", error);
      }
      throw error;
    }

    // Transform the data to match our UserWithRoles interface
    const transformStart = performance.now();
    const usersWithRoles: UserWithRoles[] = (data || []).map((user: any) => ({
      user_id: user.user_id,
      first_name: user.first_name,
      middle_name: isValidName(user.middle_name) ? user.middle_name : undefined,
      last_name: user.last_name,
      email: user.email,
      roles: (user.user_roles || [])
        .map((ur: any) => ur.roles)
        .filter((role: any) => role !== null) as Role[],
    }));

    const transformTime = performance.now() - transformStart;

    // Performance logging only in development
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[Performance] Data transformation took ${transformTime.toFixed(2)}ms`
      );
      console.log(`[Performance] Total time: ${(queryTime + transformTime).toFixed(2)}ms`);
      console.log(`[Performance] Fetched ${usersWithRoles.length} users`);
    }

    return usersWithRoles;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Failed to fetch users:", error);
    }
    throw error;
  }
}
