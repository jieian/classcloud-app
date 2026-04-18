import {
  createServerSupabaseClient,
  getPermissionsFromUser,
} from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import {
  generateRawToken,
  hashToken,
  encryptPassword,
  decryptPassword,
} from "@/lib/crypto";
import { insertAuditLog } from "@/lib/audit";
import { sendInvitationEmail, sendInviteCancelledEmail } from "@/lib/email/templates";

const _PATCH = async function (request: Request) {
  // ── Auth + permissions ────────────────────────────────────────────────────
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = getPermissionsFromUser(caller);
  if (!permissions.includes("users.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { uid, email, first_name, middle_name, last_name, password, role_ids } =
    body;

  if (!uid || !email || !first_name || !last_name || !Array.isArray(role_ids)) {
    return Response.json({ error: "Missing required fields." }, { status: 400 });
  }

  // Look up existing invitation
  const { data: invitation } = await adminClient
    .from("user_invitations")
    .select("id, encrypted_password")
    .eq("uid", uid)
    .single();

  if (!invitation) {
    return Response.json(
      { error: "No pending invitation found for this user." },
      { status: 404 },
    );
  }

  // Get current auth email (to detect change)
  const { data: authUserData } = await adminClient.auth.admin.getUserById(uid);
  const oldEmail = authUserData?.user?.email ?? "";
  const newEmail = email.trim().toLowerCase();
  const emailChanged = oldEmail.toLowerCase() !== newEmail;

  // Get current profile (for audit old_values)
  const { data: oldProfile } = await adminClient
    .from("users")
    .select("first_name, middle_name, last_name")
    .eq("uid", uid)
    .single();

  // Determine password to store
  let tempPassword: string;
  let encryptedPw: string;

  if (password) {
    tempPassword = password;
    encryptedPw = encryptPassword(password);
  } else {
    // Reuse existing encrypted password
    encryptedPw = invitation.encrypted_password;
    try {
      tempPassword = decryptPassword(encryptedPw);
    } catch {
      return Response.json(
        { error: "Failed to read existing password." },
        { status: 500 },
      );
    }
  }

  // Update auth user (email and/or password)
  const authUpdate: Record<string, string> = {};
  if (emailChanged) authUpdate.email = newEmail;
  if (password) authUpdate.password = password;

  if (Object.keys(authUpdate).length > 0) {
    const { error: authUpdateError } =
      await adminClient.auth.admin.updateUserById(uid, authUpdate);
    if (authUpdateError) {
      return Response.json(
        { error: "Failed to update account credentials." },
        { status: 500 },
      );
    }
  }

  // Update profile and replace roles atomically in a single PG transaction
  const { error: profileError } = await adminClient.rpc("update_user_atomic", {
    p_uid: uid,
    p_first_name: first_name.trim(),
    p_middle_name: middle_name?.trim() || "",
    p_last_name: last_name.trim(),
    p_role_ids: role_ids,
  });

  if (profileError) {
    return Response.json(
      { error: "Failed to update user profile." },
      { status: 500 },
    );
  }

  // Fetch role names for email
  const { data: roleData } = await adminClient
    .from("roles")
    .select("name")
    .in("role_id", role_ids);
  const roleNames = (roleData ?? []).map((r: { name: string }) => r.name);

  // Generate new token (invalidate old link)
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);

  const { error: inviteUpdateError } = await adminClient
    .from("user_invitations")
    .update({ token_hash: tokenHash, encrypted_password: encryptedPw })
    .eq("id", invitation.id);

  if (inviteUpdateError) {
    return Response.json(
      { error: "Failed to regenerate invitation link." },
      { status: 500 },
    );
  }

  // Resolve origin for activation link
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : new URL(request.url).origin);

  const activationLink = `${origin}/invite/activate?token=${rawToken}`;

  // If email changed: notify old email that invitation was cancelled
  if (emailChanged && oldEmail) {
    sendInviteCancelledEmail({
      to: oldEmail,
      firstName: oldProfile?.first_name ?? first_name.trim(),
    }).catch((e) =>
      console.error("Failed to send cancellation to old email:", e),
    );
  }

  // Send new invitation to (possibly new) email
  try {
    await sendInvitationEmail({
      to: newEmail,
      firstName: first_name.trim(),
      middleName: middle_name?.trim() || undefined,
      lastName: last_name.trim(),
      roles: roleNames,
      tempPassword,
      activationLink,
    });
  } catch {
    return Response.json(
      { error: "Failed to send invitation email." },
      { status: 500 },
    );
  }

  // Audit log (non-fatal)
  insertAuditLog({
    actor_id: caller.id,
    category: "ADMIN",
    action: "user_invite_edited",
    entity_type: "user",
    entity_id: uid,
    entity_label: `${first_name.trim()} ${last_name.trim()}`,
    old_values: {
      email: oldEmail,
      first_name: oldProfile?.first_name,
      last_name: oldProfile?.last_name,
    },
    new_values: {
      email: newEmail,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
    },
  }).catch(() => {});

  return Response.json({ success: true });
};

export const PATCH = withErrorHandler(_PATCH);
