import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { hashToken, decryptPassword } from "@/lib/crypto";
import { insertAuditLog } from "@/lib/audit";
import { sendInviteActivatedEmail } from "@/lib/email/templates";
import { syncUserPermissions } from "@/lib/permissions-sync";

const _POST = async function (request: Request) {
  const body = await request.json();
  const { token } = body;

  if (!token || typeof token !== "string") {
    return Response.json({ error: "Missing token." }, { status: 400 });
  }

  const tokenHash = hashToken(token);

  // Look up invitation by token hash
  const { data: invitation, error: lookupError } = await adminClient
    .from("user_invitations")
    .select("id, uid, encrypted_password")
    .eq("token_hash", tokenHash)
    .single();

  if (lookupError || !invitation) {
    return Response.json(
      {
        error: "invalid",
        message: "This invitation link is invalid or has already been used.",
      },
      { status: 404 },
    );
  }

  const uid = invitation.uid as string;

  // Decrypt temp password to show on activation page
  let tempPassword: string;
  try {
    tempPassword = decryptPassword(invitation.encrypted_password);
  } catch {
    console.error("Failed to decrypt invitation password for uid:", uid);
    return Response.json({ error: "Internal error." }, { status: 500 });
  }

  // Fetch current profile + roles before activation (preserve them unchanged)
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

  const userProfile = profileResult.data;
  const existingRoleIds = (rolesResult.data ?? []).map(
    (r: any) => r.role_id as number,
  );
  const roleNames = (rolesResult.data ?? [])
    .map((r: any) => (r.roles as { name: string } | null)?.name)
    .filter((n): n is string => Boolean(n));
  const email = authResult.data?.user?.email ?? "";

  // Activate user (sets active_status = 1, preserves names/roles)
  const { error: activateError } = await adminClient.rpc(
    "activate_user_atomic",
    {
      p_uid: uid,
      p_first_name: userProfile?.first_name ?? "",
      p_middle_name: userProfile?.middle_name ?? "",
      p_last_name: userProfile?.last_name ?? "",
      p_role_ids: existingRoleIds,
    },
  );

  if (activateError) {
    console.error("activate_user_atomic failed:", activateError.message);
    if (activateError.message.includes("already active")) {
      return Response.json(
        {
          error: "already_used",
          message: "This account has already been activated.",
        },
        { status: 409 },
      );
    }
    return Response.json(
      { error: "Failed to activate account. Please try again." },
      { status: 500 },
    );
  }

  // Hard-delete invitation record (token consumed)
  const { error: deleteError } = await adminClient
    .from("user_invitations")
    .delete()
    .eq("id", invitation.id);
  if (deleteError) console.error("Failed to delete invitation record:", deleteError.message);

  // Sync JWT permissions (non-fatal)
  syncUserPermissions(uid).catch((e) =>
    console.error("syncUserPermissions failed after invite activation:", e),
  );

  // Audit log (non-fatal)
  insertAuditLog({
    actor_id: uid,
    category: "ADMIN",
    action: "user_activated_invite",
    entity_type: "user",
    entity_id: uid,
    entity_label:
      `${userProfile?.first_name ?? ""} ${userProfile?.last_name ?? ""}`.trim(),
  }).catch(() => {});

  // Send confirmation email (non-fatal)
  if (email) {
    sendInviteActivatedEmail({
      to: email,
      firstName: userProfile?.first_name ?? "",
    }).catch((e) =>
      console.error("Failed to send invite-activated email:", e),
    );
  }

  return Response.json({
    success: true,
    first_name: userProfile?.first_name ?? "",
    full_name:
      [userProfile?.first_name, userProfile?.middle_name, userProfile?.last_name]
        .filter(Boolean)
        .join(" "),
    email,
    tempPassword,
    role_ids: existingRoleIds,
    role_names: roleNames,
  });
};

export const POST = withErrorHandler(_POST);
