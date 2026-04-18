/**
 * User Mutation Service
 * SECURITY: Uses atomic database transactions via RPC
 * AUTH: Email/password stored in auth.users, updated via API route
 * INTEGRITY: Rollback on any failure prevents data inconsistency
 */

import type { CreateUserData } from "./types";

export interface UpdateUserData {
  uid: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  newPassword?: string;
  role_ids: number[];
}

/**
 * Updates user profile (names + roles) via the secure API route,
 * then updates auth.users (email/password) via API route if needed.
 */
export async function updateUser(data: UpdateUserData): Promise<void> {
  // Step 1: Update profile (names + roles) via server-side route.
  // The route runs update_user_atomic via the admin client and calls
  // syncUserPermissions to keep JWT claims fresh.
  const response = await fetch("/api/users/update-profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uid: data.uid,
      first_name: data.first_name,
      middle_name: data.middle_name ?? "",
      last_name: data.last_name,
      role_ids: data.role_ids,
    }),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const msg: string = result.error ?? "";

    if (msg.includes("not found")) {
      throw new Error("User not found. Please refresh and try again.");
    }
    if (msg.includes("role")) {
      throw new Error("Invalid role selection. Please check roles and try again.");
    }
    throw new Error(msg || "Failed to update user. Please check your connection and try again.");
  }

  // Step 2: Update password in auth.users if changed
  if (data.newPassword) {
    await updateAuthUser(data.uid, undefined, data.newPassword);
  }
}

/**
 * Soft-deletes an active user: stamps deleted_at and bans their auth account.
 */
export async function deleteUser(uid: string): Promise<void> {
  await deleteAuthUser(uid, true);
}

/**
 * Activates a pending user via the secure API route.
 * Handles both new users and restored (soft-deleted) users — unbans auth account if needed.
 */
export async function activateUser(
  uid: string,
  firstName: string,
  middleName: string,
  lastName: string,
  roleIds: number[],
): Promise<void> {
  const response = await fetch("/api/users/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uid,
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      role_ids: roleIds,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to activate user. Please try again.");
  }
}

/**
 * Rejects a pending user: sends rejection email then hard-deletes from auth.users.
 * ON DELETE CASCADE handles users + user_roles automatically.
 */
export async function rejectPendingUser(uid: string, reason: string): Promise<void> {
  const response = await fetch("/api/users/reject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, reason }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to reject user. Please try again.");
  }
}

/**
 * Calls the server-side API route to delete a user from auth.users.
 * Pass soft=true for active users (stamps deleted_at + bans auth).
 * Pass soft=false (default) for pending user rejection (hard delete).
 */
async function deleteAuthUser(uuid: string, soft = false): Promise<void> {
  const response = await fetch("/api/users/delete-auth", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuid, soft }),
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
 * Creates and invites a new user via the secure API route.
 * The user is created with active_status=0 and an invitation email is sent.
 */
export async function createUser(data: CreateUserData): Promise<void> {
  const response = await fetch("/api/users/create-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    const err = new Error(result.error || "Failed to create user.");
    (err as any).code = result.code;
    throw err;
  }
}

/**
 * Cancels a pending admin invitation and deletes the auth account.
 */
export async function cancelInvite(uid: string): Promise<void> {
  const response = await fetch("/api/users/cancel-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to cancel invitation.");
  }
}

/**
 * Resends the invitation email with a new token (invalidates the old link).
 */
export async function resendInvite(uid: string): Promise<void> {
  const response = await fetch("/api/users/resend-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to resend invitation.");
  }
}

export interface EditInviteData {
  uid: string;
  email: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  password?: string;
  role_ids: number[];
}

/**
 * Edits a pending invited user's details, invalidates the old token,
 * and resends the invitation email.
 */
export async function editInvite(data: EditInviteData): Promise<void> {
  const response = await fetch("/api/users/edit-invite", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to update invitation.");
  }
}

/**
 * Changes the current user's password (forced change on first login).
 * Clears must_change_password and adds an audit log entry.
 */
export async function changePasswordForced(newPassword: string): Promise<void> {
  const response = await fetch("/api/users/change-password-forced", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPassword }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to change password.");
  }
}

