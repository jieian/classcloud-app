/**
 * User Mutation Service
 * SECURITY: Uses atomic database transactions via RPC
 * AUTH: Email/password stored in auth.users, updated via API route
 * INTEGRITY: Rollback on any failure prevents data inconsistency
 */

import { getSupabase } from "@/lib/supabase/client";
import type { CreateUserData } from "./types";

export interface UpdateUserData {
  uid: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  newEmail?: string;
  newPassword?: string;
  role_ids: number[];
}

/**
 * Updates user profile (names + roles) via RPC,
 * then updates auth.users (email/password) via API route if needed.
 */
export async function updateUser(data: UpdateUserData): Promise<void> {
  const supabase = getSupabase();
  try {
    // Step 1: Update profile (names + roles) atomically via RPC
    const { data: result, error } = await supabase.rpc("update_user_atomic", {
      p_uid: data.uid,
      p_first_name: data.first_name,
      p_middle_name: data.middle_name || "",
      p_last_name: data.last_name,
      p_role_ids: data.role_ids,
    });

    if (error) {
      console.error("RPC Error:", error);

      if (error.message.includes("not found")) {
        throw new Error("User not found. Please refresh and try again.");
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

    // Step 2: Update auth.users (email/password) if needed
    if (data.newEmail || data.newPassword) {
      await updateAuthUser(data.uid, data.newEmail, data.newPassword);
    }
  } catch (error) {
    console.error("Failed to update user:", error);

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("An unexpected error occurred. Please try again.");
  }
}

/**
 * Deletes a user by deleting from auth.users.
 * ON DELETE CASCADE handles users + user_roles automatically.
 */
export async function deleteUser(uid: string): Promise<void> {
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
  const supabase = getSupabase();
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
 * Rejects a pending user by deleting from auth.users.
 * ON DELETE CASCADE handles users + user_roles automatically.
 */
export async function rejectPendingUser(uid: string): Promise<void> {
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
 * Calls the server-side API route to update email/password in auth.users.
 */
async function updateAuthUser(
  uid: string,
  email?: string,
  password?: string,
): Promise<void> {
  const response = await fetch("/api/users/update-auth", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, email, password }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Failed to update auth account.");
  }
}

/**
 * Creates a new user by sending all data to the Secure API Route.
 * The API handles Auth + Database + Roles + Rollback automatically.
 */
export async function createUser(data: CreateUserData): Promise<void> {
  // 1. Send EVERYTHING to the server (Names, Email, Password, Roles)
  const response = await fetch("/api/users/create-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data), 
  });

  const result = await response.json();

  // 2. Check for Server Errors
  if (!response.ok) {
    // Pass the specific error message from the API (e.g. "Email already exists")
    throw new Error(result.error || "Failed to create user.");
  }
}
