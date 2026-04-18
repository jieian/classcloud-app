import {
  createServerSupabaseClient,
  getPermissionsFromUser,
} from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { generateRawToken, hashToken, decryptPassword } from "@/lib/crypto";
import { insertAuditLog } from "@/lib/audit";
import { sendInvitationEmail } from "@/lib/email/templates";

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

  const body = await request.json();
  const { uid } = body;

  if (!uid) {
    return Response.json({ error: "Missing uid." }, { status: 400 });
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

  // Decrypt existing password (reused in resend)
  let tempPassword: string;
  try {
    tempPassword = decryptPassword(invitation.encrypted_password);
  } catch {
    return Response.json(
      { error: "Failed to read invitation data." },
      { status: 500 },
    );
  }

  // Generate new token (invalidates old link)
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);

  const { error: updateError } = await adminClient
    .from("user_invitations")
    .update({ token_hash: tokenHash })
    .eq("id", invitation.id);

  if (updateError) {
    return Response.json(
      { error: "Failed to regenerate invitation link." },
      { status: 500 },
    );
  }

  // Fetch user info + roles for email
  const [profileResult, rolesResult, authResult] = await Promise.all([
    adminClient
      .from("users")
      .select("first_name, middle_name, last_name")
      .eq("uid", uid)
      .single(),
    adminClient
      .from("user_roles")
      .select("role_id, roles(name)")
      .eq("uid", uid),
    adminClient.auth.admin.getUserById(uid),
  ]);

  const firstName = profileResult.data?.first_name ?? "";
  const middleName = profileResult.data?.middle_name ?? undefined;
  const lastName = profileResult.data?.last_name ?? "";
  const email = authResult.data?.user?.email ?? "";
  const roleNames = (rolesResult.data ?? []).map(
    (r: any) => r.roles?.name ?? "",
  ).filter(Boolean);

  // Resolve origin for activation link
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : new URL(request.url).origin);

  const activationLink = `${origin}/invite/activate?token=${rawToken}`;

  // Send resend email
  try {
    await sendInvitationEmail({
      to: email,
      firstName,
      middleName: middleName || undefined,
      lastName,
      roles: roleNames,
      tempPassword,
      activationLink,
      isResend: true,
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
    action: "user_invite_resent",
    entity_type: "user",
    entity_id: uid,
    entity_label: `${firstName} ${lastName}`.trim(),
  }).catch(() => {});

  return Response.json({ success: true });
};

export const POST = withErrorHandler(_POST);
