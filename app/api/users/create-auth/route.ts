import { promises as dns } from "dns";
import {
  createServerSupabaseClient,
  getPermissionsFromUser,
} from "@/lib/supabase/server";
import { sendInvitationEmail } from "@/lib/email/templates";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { generateRawToken, hashToken, encryptPassword } from "@/lib/crypto";
import { insertAuditLog } from "@/lib/audit";

const ALLOWED_DOMAINS = ["baliuagu.edu.ph", "gmail.com", "deped.gov.ph"];

async function domainHasMxRecords(email: string): Promise<boolean> {
  const domain = email.split("@")[1];
  if (!domain) return false;
  try {
    const records = await dns.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}

const _POST = async function (request: Request) {
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

  // ── Parse payload ─────────────────────────────────────────────────────────
  const body = await request.json();
  const { email, password, first_name, middle_name, last_name, role_ids } =
    body;

  if (!email || !password || !first_name || !last_name || !role_ids) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!Array.isArray(role_ids) || role_ids.length === 0) {
    return Response.json(
      { error: "At least one role must be selected." },
      { status: 400 },
    );
  }

  const trimmedEmail = email.trim().toLowerCase();

  // ── Domain check ──────────────────────────────────────────────────────────
  if (!ALLOWED_DOMAINS.some((d) => trimmedEmail.endsWith(`@${d}`))) {
    return Response.json(
      {
        error: `Email must be a @${ALLOWED_DOMAINS.join(" or @")} address.`,
      },
      { status: 400 },
    );
  }

  // ── Email status check ────────────────────────────────────────────────────
  const { data: emailStatus, error: emailCheckError } = await adminClient.rpc(
    "check_email_status",
    { p_email: trimmedEmail, p_exclude_uid: null },
  );

  if (emailCheckError) {
    return Response.json(
      { error: "Failed to verify email availability." },
      { status: 500 },
    );
  }

  if (emailStatus?.status === "active") {
    return Response.json({ error: "Email already in use." }, { status: 409 });
  }

  if (emailStatus?.status === "pending_invite") {
    return Response.json(
      { error: "This email already has a pending invitation." },
      { status: 409 },
    );
  }

  // ── DNS MX check ──────────────────────────────────────────────────────────
  const domainValid = await domainHasMxRecords(trimmedEmail);
  if (!domainValid) {
    return Response.json(
      {
        error: `The domain for "${trimmedEmail}" does not appear to accept mail. Double-check the address.`,
        code: "EMAIL_DELIVERY_FAILED",
      },
      { status: 422 },
    );
  }

  // ── Resolve origin for activation link ────────────────────────────────────
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : new URL(request.url).origin);

  // ── Handle restore path (soft-deleted email) ──────────────────────────────
  if (emailStatus?.status === "deleted") {
    const uid = emailStatus.uid as string;

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const encryptedPw = encryptPassword(password);
    const activationLink = `${origin}/invite/activate?token=${rawToken}`;

    // Fetch role names for email
    const { data: roleData } = await adminClient
      .from("roles")
      .select("name")
      .in("role_id", role_ids);
    const roleNames = (roleData ?? []).map((r: { name: string }) => r.name);

    // Restore: unban + update credentials
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      uid,
      {
        password,
        ban_duration: "none",
        user_metadata: { full_name: `${first_name} ${last_name}` },
      },
    );
    if (updateError) {
      return Response.json(
        { error: "Failed to restore account. Please try again." },
        { status: 500 },
      );
    }

    // Reset profile to pending + must_change_password
    const { error: profileError } = await adminClient
      .from("users")
      .update({
        first_name: first_name.trim(),
        middle_name: middle_name?.trim() || null,
        last_name: last_name.trim(),
        active_status: 0,
        must_change_password: true,
        deleted_at: null,
      })
      .eq("uid", uid);

    if (profileError) {
      await adminClient.auth.admin
        .updateUserById(uid, { ban_duration: "876000h" })
        .catch((e) =>
          console.error("CRITICAL: failed to re-ban after profile error:", e),
        );
      return Response.json(
        { error: "Failed to update user profile." },
        { status: 500 },
      );
    }

    // Replace roles
    await adminClient.from("user_roles").delete().eq("uid", uid);
    if (role_ids.length > 0) {
      await adminClient.from("user_roles").insert(
        role_ids.map((rid: number) => ({ uid, role_id: rid })),
      );
    }

    // Insert invitation record
    const { error: inviteError } = await adminClient
      .from("user_invitations")
      .upsert({ uid, token_hash: tokenHash, encrypted_password: encryptedPw });

    if (inviteError) {
      console.error("Failed to create invitation record:", inviteError.message);
      return Response.json(
        { error: "Failed to create invitation. Please try again." },
        { status: 500 },
      );
    }

    // Send invitation email
    try {
      await sendInvitationEmail({
        to: trimmedEmail,
        firstName: first_name.trim(),
        middleName: middle_name?.trim() || undefined,
        lastName: last_name.trim(),
        roles: roleNames,
        tempPassword: password,
        activationLink,
      });
    } catch {
      await adminClient
        .from("user_invitations")
        .delete()
        .eq("uid", uid)
        .then(undefined, () => {});
      await adminClient.auth.admin
        .updateUserById(uid, { ban_duration: "876000h" })
        .catch((e) =>
          console.error("CRITICAL: failed to re-ban after email failure:", e),
        );
      return Response.json(
        {
          error: `The invitation email could not be delivered to "${trimmedEmail}". Double-check the address.`,
          code: "EMAIL_DELIVERY_FAILED",
        },
        { status: 422 },
      );
    }

    insertAuditLog({
      actor_id: caller.id,
      category: "ADMIN",
      action: "user_invited",
      entity_type: "user",
      entity_id: uid,
      entity_label: `${first_name.trim()} ${last_name.trim()}`,
      new_values: { email: trimmedEmail, role_ids },
    }).catch(() => {});

    return Response.json({ success: true, uuid: uid }, { status: 200 });
  }

  // ── New user path ─────────────────────────────────────────────────────────
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const encryptedPw = encryptPassword(password);
  const activationLink = `${origin}/invite/activate?token=${rawToken}`;

  // Fetch role names for email
  const { data: roleData } = await adminClient
    .from("roles")
    .select("name")
    .in("role_id", role_ids);
  const roleNames = (roleData ?? []).map((r: { name: string }) => r.name);

  // Send invitation email before creating any records (rollback-safe)
  try {
    await sendInvitationEmail({
      to: trimmedEmail,
      firstName: first_name.trim(),
      middleName: middle_name?.trim() || undefined,
      lastName: last_name.trim(),
      roles: roleNames,
      tempPassword: password,
      activationLink,
    });
  } catch {
    return Response.json(
      {
        error: `The invitation email could not be delivered to "${trimmedEmail}". Double-check the address — no account was created.`,
        code: "EMAIL_DELIVERY_FAILED",
      },
      { status: 422 },
    );
  }

  let newAuthUserUuid: string | null = null;

  try {
    // Create auth user (email pre-confirmed, starts banned so they can't log in until activated)
    const { data: authData, error: authError } =
      await adminClient.auth.admin.createUser({
        email: trimmedEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: `${first_name} ${last_name}` },
      });

    if (authError) throw authError;
    newAuthUserUuid = authData.user.id;

    // Create user profile + roles (active_status=0, must_change_password=true)
    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      "create_user_atomic",
      {
        p_uid: newAuthUserUuid,
        p_first_name: first_name.trim(),
        p_middle_name: middle_name?.trim() ?? "",
        p_last_name: last_name.trim(),
        p_role_ids: role_ids,
      },
    );

    if (rpcError) throw new Error(`Database error: ${rpcError.message}`);
    if (rpcResult?.success === false)
      throw new Error(rpcResult.message || "Database insert failed");

    // Store invitation token
    const { error: inviteError } = await adminClient
      .from("user_invitations")
      .insert({
        uid: newAuthUserUuid,
        token_hash: tokenHash,
        encrypted_password: encryptedPw,
      });

    if (inviteError) throw new Error(`Invitation record: ${inviteError.message}`);

    insertAuditLog({
      actor_id: caller.id,
      category: "ADMIN",
      action: "user_invited",
      entity_type: "user",
      entity_id: newAuthUserUuid,
      entity_label: `${first_name.trim()} ${last_name.trim()}`,
      new_values: { email: trimmedEmail, role_ids },
    }).catch(() => {});

    return Response.json(
      { success: true, uuid: newAuthUserUuid },
      { status: 201 },
    );
  } catch (error: any) {
    console.error(
      "CRITICAL: invitation email sent but user creation failed:",
      error.message,
    );

    if (newAuthUserUuid) {
      await adminClient.auth.admin
        .deleteUser(newAuthUserUuid)
        .catch((e) =>
          console.error("CRITICAL: auth rollback failed!", e),
        );
    }

    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export const POST = withErrorHandler(_POST);
