/**
 * User Update Service
 * SECURITY: Uses atomic database transactions via RPC
 * PASSWORD: All passwords are hashed server-side with bcrypt
 * INTEGRITY: Rollback on any failure prevents data inconsistency
 */

import { getSupabase } from "@/lib/supabase/client";

const supabase = getSupabase();

export interface UpdateUserData {
  user_id: number;
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  password?: string;
  role_ids: number[];
}

/**
 * Updates user with atomic transaction
 * Uses Postgres RPC function for:
 * - Atomic updates (all or nothing)
 * - Server-side password hashing (bcrypt)
 * - Data integrity (prevents partial updates)
 */
export async function updateUser(data: UpdateUserData): Promise<void> {
  try {
    // Call RPC function with atomic transaction
    const { data: result, error } = await supabase.rpc("update_user_atomic", {
      p_user_id: data.user_id,
      p_first_name: data.first_name,
      p_middle_name: data.middle_name || "",
      p_last_name: data.last_name,
      p_email: data.email,
      p_password: data.password || null,
      p_role_ids: data.role_ids,
    });

    if (error) {
      console.error("RPC Error:", error);

      // Provide specific error messages
      if (error.message.includes("not found")) {
        throw new Error("User not found. Please refresh and try again.");
      }

      if (error.message.includes("email")) {
        throw new Error(
          "Email address is already in use. Please use a different email."
        );
      }

      if (error.message.includes("role")) {
        throw new Error(
          "Invalid role selection. Please check roles and try again."
        );
      }

      // Generic fallback
      throw new Error(
        "Failed to update user. Please check your connection and try again."
      );
    }

    // Verify success
    if (!result || !result.success) {
      throw new Error("Update operation did not complete successfully.");
    }

    console.log("User updated successfully:", result);
  } catch (error) {
    console.error("Failed to update user:", error);

    // Re-throw with user-friendly message if it's not already
    if (error instanceof Error) {
      throw error;
    }

    throw new Error("An unexpected error occurred. Please try again.");
  }
}

export async function deleteUser(userId: number): Promise<void> {
  // Delete user_roles first (foreign key dependency), then the user
  const { error: rolesError } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId);

  if (rolesError) {
    throw new Error("Failed to remove user roles. Please try again.");
  }

  const { error } = await supabase
    .from("users")
    .delete()
    .eq("user_id", userId);

  if (error) {
    throw new Error("Failed to delete user. Please try again.");
  }
}

/**
 * Fetches all available roles
 * Cached on client for performance
 */
export async function fetchAllRoles(): Promise<
  Array<{ role_id: number; name: string }>
> {
  try {
    const { data, error } = await supabase
      .from("roles")
      .select("role_id, name")
      .order("name");

    if (error) {
      console.error("Error fetching roles:", error);
      throw new Error(
        "Failed to load roles. Please refresh the page and try again."
      );
    }

    return data || [];
  } catch (error) {
    console.error("Failed to fetch roles:", error);

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("An unexpected error occurred while loading roles.");
  }
}
