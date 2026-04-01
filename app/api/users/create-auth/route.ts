import { promises as dns } from "dns";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/email/templates";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
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

const _POST = async function(request: Request) {
  // 1. SECURITY: Verify the CALLER (the admin user clicking the button)
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. PERMISSIONS: Verify caller has the right to create users
  const permissions = await getUserPermissions(caller.id);
  if (!permissions.includes("users.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. PAYLOAD: Parse ALL data needed for both Auth and DB
  const body = await request.json();
  const { email, password, first_name, middle_name, last_name, role_ids } = body;

  if (!email || !password || !first_name || !last_name || !role_ids) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // --- CHECK EMAIL STATUS ---
  const { data: emailStatus, error: emailCheckError } = await adminClient.rpc(
    "check_email_status",
    { p_email: email, p_exclude_uid: null },
  );

  if (emailCheckError) {
    return Response.json({ error: "Failed to verify email availability." }, { status: 500 });
  }

  if (emailStatus?.status === "active") {
    return Response.json({ error: "Email already in use" }, { status: 409 });
  }

  // --- DNS MX CHECK ---
  const domainValid = await domainHasMxRecords(email);
  if (!domainValid) {
    return Response.json(
      {
        error: `The domain for "${email}" does not appear to accept mail. Double-check the address — no account was created.`,
        code: "EMAIL_DELIVERY_FAILED",
      },
      { status: 422 },
    );
  }

  // --- RESTORE PATH: email belongs to a soft-deleted account ---
  // Unban + update credentials, then activate immediately (admin-created = no pending state).
  if (emailStatus?.status === "deleted") {
    const uid = emailStatus.uid as string;

    const { error: updateError } = await adminClient.auth.admin.updateUserById(uid, {
      password,
      ban_duration: "none",
      user_metadata: { full_name: `${first_name} ${last_name}` },
    });

    if (updateError) {
      return Response.json({ error: "Failed to restore account. Please try again." }, { status: 500 });
    }

    // Send welcome email before DB changes so we can bail cleanly on failure
    try {
      await sendWelcomeEmail({ to: email, firstName: first_name, lastName: last_name, password });
    } catch {
      // Rollback: re-ban the user
      await adminClient.auth.admin
        .updateUserById(uid, { ban_duration: "876000h" })
        .catch((err) => console.error("CRITICAL: Failed to re-ban on email rollback:", err));
      return Response.json(
        {
          error: `The welcome email could not be delivered to "${email}". Double-check the address — no account was created.`,
          code: "EMAIL_DELIVERY_FAILED",
        },
        { status: 422 },
      );
    }

    // Activate: clears deleted_at, sets active_status=1, updates names, replaces roles
    const { data: rpcResult, error: rpcError } = await adminClient.rpc("activate_user_atomic", {
      p_uid: uid,
      p_first_name: first_name,
      p_middle_name: middle_name || "",
      p_last_name: last_name,
      p_role_ids: role_ids,
    });

    if (rpcError || rpcResult?.success === false) {
      console.error("CRITICAL: Welcome email sent but restore activation failed:", rpcError?.message);
      return Response.json({ error: "Account restore failed. Please try again." }, { status: 500 });
    }

    return Response.json({ success: true, uuid: uid }, { status: 200 });
  }

  // --- NEW USER PATH ---
  // Send email first — if it fails, nothing has been created yet.
  try {
    await sendWelcomeEmail({ to: email, firstName: first_name, lastName: last_name, password });
  } catch {
    return Response.json(
      {
        error: `The welcome email could not be delivered to "${email}". Double-check the address — no account was created.`,
        code: "EMAIL_DELIVERY_FAILED",
      },
      { status: 422 },
    );
  }

  let newAuthUserUuid: string | null = null;

  try {
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `${first_name} ${last_name}` },
    });

    if (authError) throw authError;
    newAuthUserUuid = authData.user.id;

    const { data: rpcResult, error: rpcError } = await adminClient.rpc("create_user_atomic", {
      p_uid: newAuthUserUuid,
      p_first_name: first_name,
      p_middle_name: middle_name || "",
      p_last_name: last_name,
      p_role_ids: role_ids,
    });

    if (rpcError) throw new Error(`Database Error: ${rpcError.message}`);
    if (rpcResult?.success === false) throw new Error(rpcResult.message || "Database insert failed");

    return Response.json({ success: true, uuid: newAuthUserUuid }, { status: 201 });

  } catch (error: any) {
    console.error("CRITICAL: Welcome email sent but user creation failed:", error.message);

    if (newAuthUserUuid) {
      await adminClient.auth.admin.deleteUser(newAuthUserUuid).catch((err) =>
        console.error("CRITICAL: Auth rollback failed!", err),
      );
    }

    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export const POST = withErrorHandler(_POST)
