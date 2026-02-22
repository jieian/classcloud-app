/**
 * User Update Service
 * SECURITY: Uses atomic database transactions via RPC
 * PASSWORD: All passwords are hashed server-side with bcrypt
 * INTEGRITY: Rollback on any failure prevents data inconsistency
 */

import { getSupabase } from "@/lib/supabase/client";

const supabase = getSupabase();

export interface UpdateUserData {
  uid: string;
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
    const { data: result, error } = await supabase.rpc("update_user_atomic", {
      p_uid: data.uid,
      p_first_name: data.first_name,
      p_middle_name: data.middle_name || "",
      p_last_name: data.last_name,
      p_email: data.email,
      p_password: data.password || null,
      p_role_ids: data.role_ids,
    });

    if (error) {
      console.error("RPC Error:", error);

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

      throw new Error(
        "Failed to update user. Please check your connection and try again."
      );
    }

    if (!result || !result.success) {
      throw new Error("Update operation did not complete successfully.");
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("An unexpected error occurred. Please try again.");
  }
}

/**
 * Deletes a user atomically via RPC (user_roles + users in one transaction),
 * then cleans up their auth.users entry via the API route.
 */
export async function deleteUser(uid: string): Promise<void> {
  const { error } = await supabase.rpc("delete_user_atomic", {
    p_uid: uid,
  });

  if (error) {
    if (error.message.includes("not found")) {
      throw new Error("User not found. Please refresh and try again.");
    }
    throw new Error("Failed to delete user. Please try again.");
  }

  await deleteAuthUser(uid);
}

/**
 * Activates a pending user atomically via RPC.
 * Sets active_status = 1 and assigns roles in a single transaction.
 */
export async function activateUser(
  uid: string,
  roleIds: number[],
): Promise<void> {
  const { data: result, error } = await supabase.rpc("activate_user_atomic", {
    p_uid: uid,
    p_role_ids: roleIds,
  });

  if (error) {
    if (error.message.includes("not found") || error.message.includes("already active")) {
      throw new Error("User not found or already active. Please refresh.");
    }
    throw new Error("Failed to activate user. Please try again.");
  }

  if (!result?.success) {
    throw new Error("Activation did not complete successfully.");
  }
}

/**
 * Rejects a pending user: atomic DB deletion via RPC,
 * then removes their auth.users entry.
 */
export async function rejectPendingUser(uid: string): Promise<void> {
  const { error } = await supabase.rpc("delete_user_atomic", {
    p_uid: uid,
  });

  if (error) {
    throw new Error("Failed to delete user record. Please try again.");
  }

  await deleteAuthUser(uid);
}

/**
 * Calls the server-side API route to delete a user from auth.users.
 * Requires SUPABASE_SERVICE_ROLE_KEY on the server.
 */
async function deleteAuthUser(uuid: string): Promise<void> {
  const response = await fetch("/api/users/delete-auth", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuid }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Failed to remove auth account.");
  }
}

/**
 * Fetches all available roles
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
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("An unexpected error occurred while loading roles.");
  }
}
